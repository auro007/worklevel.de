"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { promoteOverdueInvoices } from "@/lib/promoteOverdueInvoices";
import { invoiceRemainder } from "@/lib/invoiceStatus";
import { euro, formatCloudError, formatDate, reminderLevelLabel } from "@/lib/utils";

type OverdueRow = {
  id: string;
  company_id: string;
  customer_id: number | string;
  document_number: string;
  status: string;
  issue_date?: string | null;
  due_date: string | null;
  total_amount: number;
  amount_paid?: number | null;
  open_amount?: number | null;
  last_reminder_at: string | null;
  reminder_count: number;
  sent_to_email?: string | null;
  days_overdue: number;
};

function isoToday() {
  return new Date().toLocaleDateString("en-CA");
}

function calcDaysOverdue(due: string | null, todayIso: string) {
  if (!due || due >= todayIso) return 0;
  const a = new Date(due + "T12:00:00").getTime();
  const b = new Date(todayIso + "T12:00:00").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export default function MahnungenPage() {
  const { customers } = useAppData();
  const { company, role } = useCompany();
  const [rows, setRows] = useState<OverdueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [refreshNote, setRefreshNote] = useState("");
  const today = isoToday();

  const load = useCallback(async () => {
    const s = getSupabaseClient();
    if (!s || !company) return;
    setLoading(true);
    setError("");
    await promoteOverdueInvoices(company.id);

    // Prefer dedicated view (V12.6); fall back to documents filter if missing.
    const viewRes = await s
      .from("overdue_open_invoices")
      .select(
        "id,company_id,customer_id,document_number,status,issue_date,due_date,total_amount,amount_paid,open_amount,last_reminder_at,reminder_count,sent_to_email,days_overdue"
      )
      .eq("company_id", company.id)
      .order("days_overdue", { ascending: false });

    if (!viewRes.error) {
      setRows(((viewRes.data ?? []) as OverdueRow[]).filter((row) => invoiceRemainder(row.open_amount ?? row.total_amount, row.open_amount != null ? 0 : row.amount_paid) > 0));
      setLoading(false);
      return;
    }

    const msg = String(viewRes.error.message || "").toLowerCase();
    const viewMissing =
      msg.includes("overdue_open_invoices") ||
      msg.includes("could not find the table") ||
      msg.includes("does not exist") ||
      msg.includes("schema cache");

    if (!viewMissing) {
      setError(formatCloudError(viewRes.error.message));
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error: e } = await s
      .from("documents")
      .select(
        "id,company_id,customer_id,document_number,status,issue_date,due_date,total_amount,amount_paid,last_reminder_at,reminder_count,sent_to_email,paid_at"
      )
      .eq("company_id", company.id)
      .eq("doc_type", "invoice")
      .in("status", ["Offen", "Überfällig"])
      .order("due_date", { ascending: true });

    if (e) {
      setError(formatCloudError(e.message));
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: OverdueRow[] = (data ?? [])
      .filter((d: any) => {
        if (d.paid_at) return false;
        if (invoiceRemainder(d.total_amount, d.amount_paid) <= 0) return false;
        if (!d.due_date) return d.status === "Überfällig";
        return d.due_date <= today || d.status === "Überfällig";
      })
      .map((d: any) => ({
        id: d.id,
        company_id: d.company_id,
        customer_id: d.customer_id,
        document_number: d.document_number,
        status: d.status,
        issue_date: d.issue_date,
        due_date: d.due_date,
        total_amount: Number(d.total_amount || 0),
        amount_paid: Number(d.amount_paid || 0),
        open_amount: invoiceRemainder(d.total_amount, d.amount_paid),
        last_reminder_at: d.last_reminder_at ?? null,
        reminder_count: Number(d.reminder_count || 0),
        sent_to_email: d.sent_to_email ?? null,
        days_overdue: calcDaysOverdue(d.due_date, today),
      }))
      .sort((a, b) => b.days_overdue - a.days_overdue);

    setRows(mapped);
    setLoading(false);
  }, [company?.id, today]);

  useEffect(() => {
    if (role === "worker") return;
    void load();
  }, [load, role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const c = customers.find((x) => Number(x.id) === Number(r.customer_id));
      const hay = `${r.document_number} ${r.status} ${c?.name ?? ""} ${c?.email ?? ""} ${c?.phone ?? ""} ${c?.city ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, customers]);

  const totalAmount = rows.reduce((s, r) => s + invoiceRemainder(r.open_amount ?? r.total_amount, r.open_amount != null ? 0 : r.amount_paid), 0);
  const neverReminded = rows.filter((r) => !r.reminder_count).length;
  const avgDays =
    rows.length === 0 ? 0 : Math.round(rows.reduce((s, r) => s + Number(r.days_overdue || 0), 0) / rows.length);

  if (role === "worker") {
    return (
      <main className="page">
        <PageHeader title="Mahnungen" subtitle="Nur für Büro / Inhaber" />
        <EmptyState
          title="Kein Zugriff"
          hint="Mitarbeiter sehen diese Seite nicht. Bitte mit Büro- oder Inhaber-Konto anmelden."
        />
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        title="Mahnungen"
        subtitle="Jede überfällige Rechnung erscheint hier automatisch"
        action={
          <Link className="ghostBtn" href="/rechnungen">
            Alle Rechnungen →
          </Link>
        }
      />
      {error && <div className="loginError pageError">{error}</div>}
      <div className="cloudNotice">
        <span className="cloudDot" /> Offene Rechnungen werden am Fälligkeitstag auf Überfällig gesetzt und erscheinen hier. Jede Mahnung wird vermerkt. Den Verlauf sehen Sie im{" "}
        <Link className="textLink" href="/versand">Versandprotokoll</Link>.
      </div>

      <section className="statsGrid">
        <StatCard label="Überfällig" value={loading ? "…" : String(rows.length)} hint="Offene Mahnungen" />
        <StatCard label="Offener Betrag" value={loading ? "…" : euro(totalAmount)} hint="Brutto überfällig" />
        <StatCard label="Ohne Mahnung" value={loading ? "…" : String(neverReminded)} hint="Noch keine Erinnerung" />
        <StatCard
          label="Ø Tage überfällig"
          value={loading ? "…" : String(avgDays)}
          hint={rows.length ? "Durchschnitt" : "—"}
        />
      </section>

      <div className="toolbar">
        <div className="toolbarLeft">
          <input
            className="searchInput"
            placeholder="Rechnung, Kunde, E-Mail, Ort…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbarRight">
          <button className="ghostBtn smallBtn" type="button" disabled={loading} onClick={() => { setRefreshNote("Liste wird aktualisiert…"); void load().finally(() => setRefreshNote("Liste aktualisiert.")); }}>
            Aktualisieren
          </button>
          {refreshNote ? <span className="cellSub">{refreshNote}</span> : null}
          <span className="cellSub">
            {filtered.length} von {rows.length}
          </span>
        </div>
      </div>

      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Kunde</th>
              <th>Nummer</th>
              <th>Betrag</th>
              <th>Fällig</th>
              <th>Tage</th>
              <th>Stufe</th>
              <th>Zuletzt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <LoadingState label="Überfällige Rechnungen werden geladen…" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    title={rows.length === 0 ? "Keine überfälligen Rechnungen" : "Keine Treffer"}
                    hint={
                      rows.length === 0
                        ? "Alle offenen Rechnungen sind innerhalb der Frist — oder es gibt noch keine."
                        : "Suche anpassen."
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const c = customers.find((x) => Number(x.id) === Number(r.customer_id));
                const level = reminderLevelLabel(r.reminder_count ?? 0);
                return (
                  <tr key={r.id} className="rowOverdue">
                    <td>
                      {c?.name ?? "—"}
                      <span className="cellSub">{c?.email || c?.phone || c?.city || "—"}</span>
                    </td>
                    <td className="orangeText">
                      {r.document_number}
                      <span className="overduePill">{r.status}</span>
                    </td>
                    <td className="money">{euro(invoiceRemainder(r.open_amount ?? r.total_amount, r.open_amount != null ? 0 : r.amount_paid))}</td>
                    <td className="dueOverdue">{r.due_date ? formatDate(r.due_date) : "—"}</td>
                    <td className="dueOverdue">
                      <strong>{r.days_overdue}</strong>
                      <span className="cellSub">Tage</span>
                    </td>
                    <td>
                      <strong>{level}</strong>
                      <span className="cellSub">{r.reminder_count ?? 0}× vermerkt</span>
                    </td>
                    <td>
                      {r.last_reminder_at
                        ? new Date(r.last_reminder_at).toLocaleString("de-DE")
                        : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Link className="ghostBtn smallBtn" href={`/rechnungen?doc=${r.id}`}>
                          Öffnen
                        </Link>
                        <Link className="primaryBtn smallBtn" href={`/rechnungen?doc=${r.id}&remind=1`}>
                          {level}
                        </Link>
                      </div>
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
