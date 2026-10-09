"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState, LoadingState, Modal, PageHeader, StatCard, Badge } from "@/components/UI";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";

type DocType = "offer" | "invoice";
type DefaultItem = {
  item_type: "service" | "material" | "text";
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};
type Template = {
  id: string;
  company_id: string;
  doc_type: DocType;
  name: string;
  title: string | null;
  intro: string | null;
  notes: string | null;
  vat_rate: number;
  default_items: DefaultItem[] | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

const blank = {
  doc_type: "offer" as DocType,
  name: "",
  title: "",
  intro: "",
  notes: "",
  vat_rate: "19",
  active: true,
  default_items_text: "",
};

function parseDefaultItems(text: string): DefaultItem[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    // Optional: Menge|Einheit|Preis|Beschreibung  or plain description
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length >= 4) {
      return {
        item_type: "service" as const,
        quantity: Number(parts[0]) || 1,
        unit: parts[1] || "Stk.",
        unit_price: Number(parts[2]) || 0,
        description: parts.slice(3).join("|") || "Position",
      };
    }
    return {
      item_type: "service" as const,
      quantity: 1,
      unit: "Stk.",
      unit_price: 0,
      description: line,
    };
  });
}

function formatDefaultItems(items: DefaultItem[] | null | undefined): string {
  if (!items || !items.length) return "";
  return items
    .map((it) => `${it.quantity}|${it.unit}|${it.unit_price}|${it.description}`)
    .join("\n");
}

export default function VorlagenPage() {
  const { company, role } = useCompany();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"Alle" | DocType>("Alle");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);

  const canManage = role === "owner" || role === "admin";

  useEffect(() => {
    if (company?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  async function load() {
    const s = getSupabaseClient();
    if (!s || !company) return;
    setLoading(true);
    setError("");
    const { data, error: e } = await s
      .from("document_templates")
      .select("*")
      .eq("company_id", company.id)
      .order("name", { ascending: true });
    if (e) setError(e.message);
    else setTemplates((data ?? []) as Template[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      const typeOk = typeFilter === "Alle" || t.doc_type === typeFilter;
      const hay = `${t.name} ${t.title ?? ""} ${t.intro ?? ""} ${t.notes ?? ""}`.toLowerCase();
      return typeOk && (!q || hay.includes(q));
    });
  }, [templates, query, typeFilter]);

  const offerCount = templates.filter((t) => t.doc_type === "offer").length;
  const invoiceCount = templates.filter((t) => t.doc_type === "invoice").length;
  const activeCount = templates.filter((t) => t.active).length;

  function openNew() {
    setEditing(null);
    setForm({
      ...blank,
      vat_rate: String(company?.default_vat_rate ?? 19),
    });
    setOpen(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({
      doc_type: t.doc_type,
      name: t.name,
      title: t.title ?? "",
      intro: t.intro ?? "",
      notes: t.notes ?? "",
      vat_rate: String(t.vat_rate ?? 19),
      active: t.active !== false,
      default_items_text: formatDefaultItems(t.default_items),
    });
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = getSupabaseClient();
    if (!s || !company || !canManage) return;
    const name = form.name.trim();
    if (!name) {
      setError("Bitte einen Vorlagennamen angeben.");
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      company_id: company.id,
      doc_type: form.doc_type,
      name,
      title: form.title.trim() || null,
      intro: form.intro.trim() || null,
      notes: form.notes.trim() || null,
      vat_rate: Number(form.vat_rate) || 0,
      default_items: parseDefaultItems(form.default_items_text),
      active: form.active,
    };
    if (editing) {
      const { error: e2 } = await s.from("document_templates").update(payload).eq("id", editing.id);
      if (e2) setError(e2.message);
    } else {
      const { error: e2 } = await s.from("document_templates").insert(payload);
      if (e2) setError(e2.message);
    }
    setBusy(false);
    setOpen(false);
    await load();
  }

  async function remove(t: Template) {
    if (!canManage) return;
    if (!confirm(`Vorlage „${t.name}“ wirklich löschen?`)) return;
    const s = getSupabaseClient();
    if (!s) return;
    setBusy(true);
    const { error: e } = await s.from("document_templates").delete().eq("id", t.id);
    if (e) setError(e.message);
    setBusy(false);
    await load();
  }

  async function toggleActive(t: Template) {
    if (!canManage) return;
    const s = getSupabaseClient();
    if (!s) return;
    const { error: e } = await s.from("document_templates").update({ active: !t.active }).eq("id", t.id);
    if (e) setError(e.message);
    else await load();
  }

  return (
    <main className="page">
      <PageHeader
        title="Dokument-Vorlagen"
        subtitle="Fertige Vorlagen für Angebote und Rechnungen — Vorbemerkungen, Nachbemerkungen, Titel und MwSt."
        action={
          <div className="headerActions">
            <Link className="ghostBtn" href="/angebote">
              Zu Angebote
            </Link>
            <Link className="ghostBtn" href="/rechnungen">
              Zu Rechnungen
            </Link>
            {canManage && (
              <button className="primaryBtn" onClick={openNew}>
                + Neue Vorlage
              </button>
            )}
          </div>
        }
      />

      {error && <div className="loginError pageError">{error}</div>}

      <div className="statsGrid">
        <StatCard label="Vorlagen" value={String(templates.length)} hint="In dieser Firma" />
        <StatCard label="Angebote" value={String(offerCount)} hint="Angebots-Vorlagen" />
        <StatCard label="Rechnungen" value={String(invoiceCount)} hint="Rechnungs-Vorlagen" />
        <StatCard label="Aktiv" value={String(activeCount)} hint="Auswählbar beim Erstellen" />
      </div>

      <div className="toolbar">
        <div className="toolbarLeft">
          <input
            className="searchInput"
            placeholder="Name, Titel, Text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "Alle" | DocType)}
          >
            <option value="Alle">Alle Typen</option>
            <option value="offer">Angebot</option>
            <option value="invoice">Rechnung</option>
          </select>
        </div>
        <div className="toolbarRight">
          <span className="cellSub">{filtered.length} Vorlagen</span>
        </div>
      </div>

      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Titel</th>
              <th>MwSt.</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <LoadingState label="Vorlagen werden geladen…" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title="Noch keine Vorlagen"
                    hint="Lege fertige Texte für Vorbemerkungen und Nachbemerkungen an — beim neuen Angebot/Rechnung einfach auswählen."
                  >
                    {canManage ? (
                      <button className="primaryBtn" onClick={openNew} style={{ marginTop: 8 }}>
                        Erste Vorlage anlegen
                      </button>
                    ) : (
                      <p>Nur Inhaber/Admin kann Vorlagen verwalten.</p>
                    )}
                  </EmptyState>
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    {(t.intro || t.notes) && (
                      <span className="cellSub">
                        {[t.intro ? "Vorbemerkung" : null, t.notes ? "Nachbemerkung" : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td>{t.doc_type === "offer" ? "Angebot" : "Rechnung"}</td>
                  <td>{t.title || "—"}</td>
                  <td>{Number(t.vat_rate).toLocaleString("de-DE")} %</td>
                  <td>
                    <Badge tone={t.active ? "green" : "gray"}>{t.active ? "Aktiv" : "Inaktiv"}</Badge>
                  </td>
                  <td className="rowActions">
                    {canManage && (
                      <>
                        <button type="button" className="ghostBtn smallBtn" onClick={() => openEdit(t)}>
                          Bearbeiten
                        </button>
                        <button type="button" className="ghostBtn smallBtn" onClick={() => toggleActive(t)}>
                          {t.active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button type="button" className="dangerIcon" onClick={() => remove(t)} title="Löschen">
                          ×
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title={editing ? "Vorlage bearbeiten" : "Neue Vorlage"}
          subtitle="Titel, Vorbemerkungen und Nachbemerkungen speichern"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit}>
            <div className="formGrid">
              <div className="formField">
                <label>Typ</label>
                <select
                  className="select"
                  value={form.doc_type}
                  onChange={(e) => setForm({ ...form, doc_type: e.target.value as DocType })}
                >
                  <option value="offer">Angebot</option>
                  <option value="invoice">Rechnung</option>
                </select>
              </div>
              <div className="formField">
                <label>MwSt. %</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.vat_rate}
                  onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
                />
              </div>
              <div className="formField wide">
                <label>Vorlagenname *</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="z. B. Standard-Wartung, Notdienst, Kleinunternehmer"
                />
              </div>
              <div className="formField wide">
                <label>Dokumenttitel (Standard)</label>
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Wird als Titel vorbefüllt"
                />
              </div>
              <div className="formField wide">
                <label>Vorbemerkungen</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={form.intro}
                  onChange={(e) => setForm({ ...form, intro: e.target.value })}
                  placeholder="Einleitungstext vor den Positionen"
                />
                <p className="fieldHint">Erscheint auf Angebot/Rechnung vor den Positionen.</p>
              </div>
              <div className="formField wide">
                <label>Nachbemerkungen</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Abschluss-Hinweise nach den Summen"
                />
                <p className="fieldHint">Erscheint auf dem Dokument nach den Summen.</p>
              </div>
              <div className="formField wide">
                <label>Standard-Positionen (optional)</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={form.default_items_text}
                  onChange={(e) => setForm({ ...form, default_items_text: e.target.value })}
                  placeholder={"Eine Zeile = eine Position\nFormat: Menge|Einheit|Preis|Beschreibung\nz. B. 1|Std.|85|Anfahrt und Diagnose"}
                />
                <p className="fieldHint">Leer lassen, wenn nur Text/MwSt. vorbefüllt werden soll.</p>
              </div>
              <div className="formField wide">
                <label className="checkLabel">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />{" "}
                  Aktiv (beim Erstellen auswählbar)
                </label>
              </div>
            </div>
            <div className="formActions">
              <button type="button" className="ghostBtn" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
              <button className="primaryBtn" disabled={busy}>
                {busy ? "Speichert…" : editing ? "Speichern" : "Vorlage anlegen"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
