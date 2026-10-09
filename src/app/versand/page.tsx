"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { formatCloudError } from "@/lib/utils";

type FilterKey = "all" | "offer" | "invoice" | "reminder";

type EventRow = {
  id: string;
  event_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
  document_id: string;
  document_number?: string | null;
  doc_type?: string | null;
  customer_id?: number | string | null;
};

const OUTBOUND_TYPES = ["sent", "shared", "reminder_logged"] as const;

function eventLabel(type: string) {
  const map: Record<string, string> = {
    sent: "Versandt (E-Mail)",
    shared: "Geteilt / vorbereitet",
    reminder_logged: "Mahnung / Erinnerung",
    invite: "Einladung",
  };
  return map[type] || type;
}

function detailSummary(details: Record<string, unknown> | null | undefined) {
  if (!details || typeof details !== "object") return "";
  const parts: string[] = [];
  const email = details.email || details.to;
  if (typeof email === "string" && email) parts.push(email);
  const method = details.method;
  if (typeof method === "string" && method) {
    const methodMap: Record<string, string> = {
      resend: "E-Mail",
      mailto: "E-Mail-Programm",
      "web-share": "Teilen",
      copy: "Text kopiert",
      manual: "manuell",
      email: "E-Mail",
    };
    parts.push(methodMap[method] || method);
  }
  const channel = details.channel;
  if (typeof channel === "string" && channel && !method) {
    const chMap: Record<string, string> = {
      email: "E-Mail",
      mailto: "E-Mail-Programm",
      copy: "Text kopiert",
      manual: "nur vermerkt",
    };
    parts.push(chMap[channel] || channel);
  }
  const providerId = details.provider_id || details.resend_id;
  if (typeof providerId === "string" && providerId) parts.push(`ID ${providerId.slice(0, 12)}…`);
  const note = details.note;
  if (typeof note === "string" && note) parts.push(note);
  return parts.filter(Boolean).join(" · ");
}

function docHref(docType: string | null | undefined, documentId: string) {
  if (docType === "invite") return "/team";
  if (docType === "offer") return `/angebote?doc=${documentId}`;
  if (docType === "invoice") return `/rechnungen?doc=${documentId}`;
  return `/rechnungen?doc=${documentId}`;
}

function docTypeLabel(docType: string | null | undefined) {
  if (docType === "offer") return "Angebot";
  if (docType === "invoice") return "Rechnung";
  if (docType === "delivery" || docType === "delivery_note") return "Lieferschein";
  if (docType === "invite") return "Einladung";
  return docType || "Dokument";
}

function sameSend(a: EventRow, b: EventRow) {
  if (a.event_type !== "sent" || b.event_type !== "sent") return false;
  if (a.document_id !== b.document_id) return false;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 8000;
}

function preferSend(current: EventRow, next: EventRow) {
  const score = (row: EventRow) => (row.details?.provider_id || row.details?.method ? 2 : 0) + detailSummary(row.details).length;
  return score(next) > score(current) ? next : current;
}

export default function VersandPage() {
  const { customers } = useAppData();
  const { company, role } = useCompany();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [mailboxEmail, setMailboxEmail] = useState("");
  const [statusNote, setStatusNote] = useState("");

  const loadStatus = useCallback(async () => {
    const s = getSupabaseClient();
    let mailbox = false;
    if (s && company) {
      const box = await s.from("company_mailboxes").select("sender_email,updated_at").eq("company_id", company.id).maybeSingle();
      mailbox = Boolean(box.data?.sender_email);
      setMailboxEmail(box.data?.sender_email || "");
    }
    try {
      const res = await fetch("/api/email-status");
      const data = await res.json().catch(() => ({}));
      setEmailConfigured(mailbox || Boolean(data?.configured));
    } catch {
      setEmailConfigured(mailbox);
    }
  }, [company?.id]);

  const load = useCallback(async () => {
    const s = getSupabaseClient();
    if (!s || !company) return;
    setLoading(true);
    setError("");

    const { data: events, error: e } = await s
      .from("document_events")
      .select("id,event_type,details,created_at,document_id,company_id")
      .eq("company_id", company.id)
      .in("event_type", [...OUTBOUND_TYPES])
      .order("created_at", { ascending: false })
      .limit(200);

    if (e) {
      setError(formatCloudError(e.message));
      setRows([]);
      setLoading(false);
      return;
    }

    const list = (events ?? []) as {
      id: string;
      event_type: string;
      details: Record<string, unknown> | null;
      created_at: string;
      document_id: string;
    }[];

    const docIds = [...new Set(list.map((x) => x.document_id).filter(Boolean))];
    let docMap = new Map<string, { document_number: string; doc_type: string; customer_id: number | string | null }>();

    if (docIds.length > 0) {
      const { data: docs } = await s
        .from("documents")
        .select("id,document_number,doc_type,customer_id")
        .eq("company_id", company.id)
        .in("id", docIds);
      for (const d of docs ?? []) {
        docMap.set(d.id, {
          document_number: d.document_number,
          doc_type: d.doc_type,
          customer_id: d.customer_id,
        });
      }
    }

    const mapped = list.map((ev) => {
      const doc = docMap.get(ev.document_id);
      return {
        ...ev,
        document_number: doc?.document_number ?? null,
        doc_type: doc?.doc_type ?? null,
        customer_id: doc?.customer_id ?? null,
      };
    });
    const unique: EventRow[] = [];
    for (const row of mapped) {
      const twin = unique.findIndex((item) => sameSend(item, row));
      if (twin >= 0) unique[twin] = preferSend(unique[twin], row);
      else unique.push(row);
    }
    const messages = await s
      .from("company_messages")
      .select("id,kind,to_email,subject,provider,provider_id,created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!messages.error) {
      for (const message of messages.data ?? []) {
        unique.push({
          id: message.id,
          event_type: message.kind === "invite" ? "invite" : message.kind,
          details: { email: message.to_email, method: message.provider || "email", provider_id: message.provider_id, note: message.subject },
          created_at: message.created_at,
          document_id: message.id,
          document_number: "Einladung",
          doc_type: "invite",
          customer_id: null,
        });
      }
      unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    setRows(unique);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => {
    if (role === "worker") return;
    void load();
    void loadStatus();
  }, [load, loadStatus, role]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "all") return true;
      if (filter === "reminder") return r.event_type === "reminder_logged";
      if (filter === "offer") return r.doc_type === "offer";
      if (filter === "invoice") return r.doc_type === "invoice" && r.event_type !== "reminder_logged";
      return true;
    });
  }, [rows, filter]);

  const counts = useMemo(() => {
    const offer = rows.filter((r) => r.doc_type === "offer").length;
    const invoice = rows.filter((r) => r.doc_type === "invoice" && r.event_type !== "reminder_logged").length;
    const reminder = rows.filter((r) => r.event_type === "reminder_logged").length;
    return { all: rows.length, offer, invoice, reminder };
  }, [rows]);

  if (role === "worker") {
    return (
      <main className="page">
        <PageHeader title="Versand" subtitle="Nur für Büro / Inhaber" />
        <EmptyState
          title="Kein Zugriff"
          hint="Mitarbeiter sehen das Versandprotokoll nicht. Bitte mit Büro- oder Inhaber-Konto anmelden."
        />
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        title="Versandprotokoll"
        subtitle="Ausgangskommunikation zu Angeboten, Rechnungen, Mahnungen und Einladungen"
        action={
          <Link className="ghostBtn" href="/rechnungen">
            Rechnungen →
          </Link>
        }
      />

      <div className="cloudNotice">
        <span className="cloudDot" /> Gesendete E-Mails, geteilte Dokumente, vermerkte Mahnungen und Einladungen.
        Ohne direkten Versand bleiben Teilen und Text kopieren nutzbar.
      </div>
      {error && <div className="loginError pageError">{error}</div>}

      <section className="settingsCard versandConfigCard" style={{ marginBottom: 16 }}>
        <h2>E-Mail-Versand</h2>
        <p className="versandConfigStatus">
          Status:{" "}
          {emailConfigured === null ? (
            <strong>…</strong>
          ) : emailConfigured ? (
            <strong className="versandOk">eingerichtet{mailboxEmail ? ` – ${mailboxEmail}` : ""}</strong>
          ) : (
            <strong className="versandWarn">noch nicht eingerichtet</strong>
          )}
        </p>
        {statusNote && <p className="cellSub">{statusNote}</p>}
        <div className="taxNotice" style={{ marginTop: 10 }}>
          {emailConfigured
            ? "Rechnungen, Angebote und Mahnungen können direkt aus WORKLEVEL gesendet werden."
            : "Der direkte Versand ist noch nicht eingerichtet. Sie können die PDF teilen oder den Text kopieren und selbst senden."}
          {role === "owner" && (
            <>
              {" "}
              <Link className="textLink" href="/firmendaten">
                Firmendaten →
              </Link>
            </>
          )}
        </div>
        <div className="formActions" style={{ marginTop: 12 }}>
          <button className="ghostBtn smallBtn" type="button" onClick={() => { setStatusNote("Status wird geprüft…"); void loadStatus().then(() => setStatusNote("Status geprüft.")); }}>
            Status prüfen
          </button>
          <button className="ghostBtn smallBtn" type="button" disabled={loading} onClick={() => { setStatusNote("Protokoll wird aktualisiert…"); void load().then(() => setStatusNote("Protokoll aktualisiert.")); }}>
            Protokoll aktualisieren
          </button>
        </div>
      </section>

      <section className="statsGrid">
        <StatCard label="Gesamt" value={loading ? "…" : String(counts.all)} hint="Ausgang (200 max.)" />
        <StatCard label="Angebote" value={loading ? "…" : String(counts.offer)} hint="Versand / Teilen" />
        <StatCard label="Rechnungen" value={loading ? "…" : String(counts.invoice)} hint="ohne Mahnungen" />
        <StatCard label="Mahnungen" value={loading ? "…" : String(counts.reminder)} hint="Erinnerungen" />
      </section>

      <div className="toolbar">
        <div className="toolbarLeft versandFilters">
          {(
            [
              ["all", "Alle", counts.all],
              ["offer", "Angebote", counts.offer],
              ["invoice", "Rechnungen", counts.invoice],
              ["reminder", "Mahnungen", counts.reminder],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              className={`workflowChip ${filter === key ? "versandFilterActive" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <b>{loading ? "…" : n}</b>
            </button>
          ))}
        </div>
        <div className="toolbarRight">
          <span className="cellSub">
            {filtered.length} Einträge
          </span>
        </div>
      </div>

      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Ereignis</th>
              <th>Dokument</th>
              <th>Kunde</th>
              <th>Details</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <LoadingState label="Versandprotokoll wird geladen…" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title={rows.length === 0 ? "Noch keine Versand-Ereignisse" : "Keine Treffer in diesem Filter"}
                    hint={
                      rows.length === 0
                        ? "Sende oder teile ein Angebot/eine Rechnung, oder vermerke eine Mahnung — dann erscheint der Eintrag hier."
                        : "Anderen Filter wählen."
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const c = customers.find((x) => Number(x.id) === Number(r.customer_id));
                const summary = detailSummary(r.details);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{new Date(r.created_at).toLocaleString("de-DE")}</strong>
                    </td>
                    <td>
                      <span className={`badge ${r.event_type === "reminder_logged" ? "orange" : r.event_type === "sent" ? "green" : "blue"}`}>
                        {eventLabel(r.event_type)}
                      </span>
                    </td>
                    <td>
                      {r.document_number || "—"}
                      <span className="cellSub">{docTypeLabel(r.doc_type)}</span>
                    </td>
                    <td>
                      {c?.name ?? "—"}
                      <span className="cellSub">{c?.email || "—"}</span>
                    </td>
                    <td className="versandDetails">{summary || "—"}</td>
                    <td>
                      {r.document_id && (
                        <Link className="ghostBtn smallBtn" href={docHref(r.doc_type, r.document_id)}>
                          Öffnen
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
