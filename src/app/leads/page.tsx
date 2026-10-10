"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, EmptyState, LoadingState, Modal, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { euro } from "@/lib/utils";
import type { Lead, LeadStatus } from "@/lib/types";
import { PlzOrtFields } from "@/components/PlzOrtFields";

const blank = {
  name: "",
  company: "",
  phone: "",
  email: "",
  street: "",
  postalCode: "",
  city: "",
  source: "Website",
  status: "Neu" as LeadStatus,
  value: "0",
  notes: "",
};

const STATUS_OPTS: LeadStatus[] = ["Neu", "Kontaktiert", "Angebot", "Gewonnen", "Verloren"];

export default function LeadsPage() {
  const {
    leads,
    customers,
    addLead,
    updateLead,
    removeLead,
    addCustomer,
    cloudLoading,
    cloudError,
  } = useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blank);

  const pipeline = leads.filter((l) => l.status !== "Verloren").reduce((s, l) => s + l.value, 0);
  const won = leads.filter((l) => l.status === "Gewonnen").reduce((s, l) => s + l.value, 0);
  const filtered = useMemo(
    () =>
      leads.filter((l) =>
        `${l.name} ${l.company} ${l.phone} ${l.email} ${l.source} ${l.status} ${l.city} ${l.street} ${l.notes ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [leads, query]
  );

  function openNew() {
    setEditing(null);
    setForm(blank);
    setOpen(true);
  }

  function openEdit(l: Lead) {
    setEditing(l);
    setForm({
      name: l.name,
      company: l.company,
      phone: l.phone,
      email: l.email,
      street: l.street,
      postalCode: l.postalCode,
      city: l.city,
      source: l.source || "Website",
      status: l.status,
      value: String(l.value ?? 0),
      notes: l.notes ?? "",
    });
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      company: form.company.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      street: form.street.trim(),
      postalCode: form.postalCode.trim(),
      city: form.city.trim(),
      source: form.source,
      status: form.status,
      value: Number(form.value || 0),
      notes: form.notes.trim(),
    };
    const ok = editing
      ? await updateLead(editing.id, payload)
      : await addLead(payload);
    if (ok) {
      setOpen(false);
      setEditing(null);
      setForm(blank);
    }
    setSaving(false);
  }

  async function convertToCustomer(leadId: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    setBusyId(leadId);
    const customerId = await addCustomer({
      number: `KD-${1001 + customers.length}`,
      name: lead.company || lead.name,
      contact: lead.name,
      street: lead.street || "",
      postalCode: lead.postalCode || "",
      city: lead.city || "",
      phone: lead.phone,
      email: lead.email,
      notes: `Aus Lead (${lead.source || "—"}) · Wert ${lead.value}€${lead.notes ? ` · ${lead.notes}` : ""}`,
    });
    if (customerId) {
      await updateLead(leadId, {
        status: "Gewonnen",
        convertedCustomerId: customerId,
      });
      window.location.href = `/angebote?customer=${customerId}`;
      return;
    }
    setBusyId("");
  }

  async function remove(l: Lead) {
    if (!confirm(`Lead „${l.name}“ wirklich löschen?`)) return;
    await removeLead(l.id);
  }

  const tone = (s: string) =>
    s === "Gewonnen" ? "green" : s === "Verloren" ? "red" : s === "Angebot" ? "orange" : s === "Kontaktiert" ? "blue" : "gray";

  return (
    <main className="page">
      <PageHeader
        title="Leads"
        subtitle="Anfrage → Kunde → Angebot (Cloud)"
        action={
          <button className="primaryBtn" onClick={openNew}>
            + Neuer Lead
          </button>
        }
      />
      
      {cloudError && <div className="loginError pageError">{cloudError}</div>}
      <div className="statsGrid">
        <StatCard label="Pipeline" value={euro(pipeline)} hint={`${leads.length} Kontakte`} />
        <StatCard label="Gewonnen" value={euro(won)} hint="Abgeschlossene Chancen" />
        <StatCard label="Offene Angebote" value={String(leads.filter((l) => l.status === "Angebot").length)} hint="Aktuell in Angebot" />
        <StatCard label="Neue Leads" value={String(leads.filter((l) => l.status === "Neu").length)} hint="Noch nicht kontaktiert" />
      </div>
      <div className="toolbar">
        <div className="toolbarLeft">
          <input
            className="searchInput"
            placeholder="Name, Firma, Telefon, E-Mail, Ort..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbarRight">
          <span className="cellSub">{filtered.length} Leads</span>
        </div>
      </div>
      <div className="tableWrap">
        {cloudLoading ? (
          <LoadingState label="Leads werden geladen…" />
        ) : filtered.length === 0 ? (
          <EmptyState title="Noch keine Leads" hint="Lege eine Anfrage an und wandle sie später in einen Kunden um." />
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Kontakt</th>
                <th>Adresse</th>
                <th>Quelle</th>
                <th>Kontakt</th>
                <th>Wert</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="cellTitle">{l.name}</span>
                    <span className="cellSub">{l.company || "Privatkunde"}</span>
                  </td>
                  <td>
                    {l.street || "—"}
                    <span className="cellSub">{[l.postalCode, l.city].filter(Boolean).join(" ") || "—"}</span>
                  </td>
                  <td>{l.source || "—"}</td>
                  <td>
                    {l.phone || "—"}
                    <span className="cellSub">{l.email || "—"}</span>
                  </td>
                  <td className="money">{euro(l.value)}</td>
                  <td>
                    <Badge tone={tone(l.status) as any}>{l.status}</Badge>
                  </td>
                  <td>
                    <div className="rowActions">
                      <button className="textLink" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => openEdit(l)}>
                        Bearbeiten
                      </button>
                      {l.convertedCustomerId ? (
                        <Link className="textLink" href={`/angebote?customer=${l.convertedCustomerId}`}>
                          Angebot
                        </Link>
                      ) : (
                        <button
                          className="textLink"
                          style={{ background: "none", border: 0, cursor: "pointer" }}
                          disabled={busyId === l.id}
                          onClick={() => convertToCustomer(l.id)}
                        >
                          {busyId === l.id ? "..." : "Als Kunde → Angebot"}
                        </button>
                      )}
                      <button className="dangerLink" onClick={() => remove(l)}>
                        Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal
          title={editing ? "Lead bearbeiten" : "Neuer Lead"}
          subtitle={editing ? "Änderungen in Supabase speichern" : "Neue Anfrage in die Cloud-Pipeline"}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form onSubmit={submit}>
            <div className="formGrid">
              <div className="formField">
                <label>Name *</label>
                <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="formField">
                <label>Firma</label>
                <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
              </div>
              <div className="formField">
                <label>Telefon</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="formField">
                <label>E-Mail</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>Straße + Hausnummer</label>
                <input className="input" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
              </div>
              <PlzOrtFields
                postalCode={form.postalCode}
                city={form.city}
                onChange={(postalCode, city) => setForm((current) => ({ ...current, postalCode, city }))}
              />
              <div className="formField">
                <label>Quelle</label>
                <select className="select" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  <option>Website</option>
                  <option>Google</option>
                  <option>Empfehlung</option>
                  <option>Telefon</option>
                  <option>Sonstiges</option>
                </select>
              </div>
              <div className="formField">
                <label>Status</label>
                <select
                  className="select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })}
                >
                  {STATUS_OPTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField">
                <label>Wert €</label>
                <input className="input" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>Notizen</label>
                <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="formActions">
              <button
                type="button"
                className="ghostBtn"
                onClick={() => {
                  setOpen(false);
                  setEditing(null);
                }}
              >
                Abbrechen
              </button>
              <button className="primaryBtn" disabled={saving}>
                {saving ? "Speichert..." : editing ? "Änderungen speichern" : "Lead speichern"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
