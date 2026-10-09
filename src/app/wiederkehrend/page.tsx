"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, EmptyState, LoadingState, Modal, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { euro, formatDate } from "@/lib/utils";
import type { RecurringCadence, RecurringJobTemplate } from "@/lib/types";

function todayLocal() {
  return new Date().toLocaleDateString("en-CA");
}

const CADENCE_LABEL: Record<RecurringCadence, string> = {
  weekly: "Wöchentlich",
  biweekly: "Alle 2 Wochen",
  monthly: "Monatlich",
};

const blank = {
  title: "",
  customerId: "",
  description: "",
  cadence: "monthly" as RecurringCadence,
  intervalDays: "",
  nextRunDate: todayLocal(),
  active: true,
  defaultAssignee: "",
  defaultTime: "08:00",
  defaultPriority: "Normal" as RecurringJobTemplate["defaultPriority"],
  estimatedHours: "2",
  defaultXp: "15",
  defaultPrice: "20",
  notes: "",
};

export default function RecurringJobsPage() {
  const {
    recurringTemplates,
    customers,
    employees,
    addRecurringTemplate,
    updateRecurringTemplate,
    removeRecurringTemplate,
    generateDueRecurringJobs,
    cloudLoading,
    cloudError,
  } = useAppData();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringJobTemplate | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [form, setForm] = useState(blank);

  const today = todayLocal();
  const dueCount = recurringTemplates.filter((t) => t.active && t.nextRunDate <= today).length;
  const activeCount = recurringTemplates.filter((t) => t.active).length;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return recurringTemplates.filter((t) => {
      const customer = customers.find((c) => c.id === t.customerId)?.name ?? "";
      return `${t.title} ${t.description} ${customer} ${t.notes ?? ""} ${CADENCE_LABEL[t.cadence]}`
        .toLowerCase()
        .includes(q);
    });
  }, [recurringTemplates, customers, query]);

  function openNew() {
    setEditing(null);
    setForm({ ...blank, customerId: customers[0]?.id ?? "", nextRunDate: todayLocal() });
    setOpen(true);
  }

  function openEdit(t: RecurringJobTemplate) {
    setEditing(t);
    setForm({
      title: t.title,
      customerId: t.customerId,
      description: t.description,
      cadence: t.cadence,
      intervalDays: t.intervalDays != null ? String(t.intervalDays) : "",
      nextRunDate: t.nextRunDate,
      active: t.active,
      defaultAssignee: t.defaultAssignee,
      defaultTime: t.defaultTime || "08:00",
      defaultPriority: t.defaultPriority,
      estimatedHours: String(t.estimatedHours ?? 2),
      defaultXp: String(t.defaultXp ?? 15),
      defaultPrice: String(t.defaultPrice ?? 0),
      notes: t.notes ?? "",
    });
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.customerId) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      customerId: form.customerId,
      description: form.description.trim(),
      cadence: form.cadence,
      intervalDays: form.intervalDays ? Number(form.intervalDays) : null,
      nextRunDate: form.nextRunDate || todayLocal(),
      active: form.active,
      defaultAssignee: form.defaultAssignee,
      defaultTime: form.defaultTime || "08:00",
      defaultPriority: form.defaultPriority,
      estimatedHours: Number(form.estimatedHours || 2),
      defaultXp: Math.max(0, Number(form.defaultXp || 0)),
      defaultPrice: Math.max(0, Number(form.defaultPrice || 0)),
      notes: form.notes.trim(),
    };
    const ok = editing
      ? await updateRecurringTemplate(editing.id, payload)
      : await addRecurringTemplate(payload);
    if (ok) {
      setOpen(false);
      setEditing(null);
      setForm(blank);
    }
    setSaving(false);
  }

  async function toggleActive(t: RecurringJobTemplate) {
    await updateRecurringTemplate(t.id, { active: !t.active });
  }

  async function remove(t: RecurringJobTemplate) {
    if (!confirm(`Vorlage „${t.title}“ wirklich löschen?`)) return;
    await removeRecurringTemplate(t.id);
  }

  async function generate() {
    setGenerating(true);
    setGenMsg("");
    const res = await generateDueRecurringJobs();
    if (res.ok) {
      setGenMsg(
        res.jobsCreated === 0
          ? "Keine fälligen Vorlagen — nichts erzeugt."
          : `${res.jobsCreated} ${res.jobsCreated === 1 ? "Auftrag" : "Aufträge"} aus ${res.templatesProcessed} ${res.templatesProcessed === 1 ? "Vorlage" : "Vorlagen"} erzeugt.`
      );
    } else {
      setGenMsg(res.message || "Erzeugen fehlgeschlagen.");
    }
    setGenerating(false);
  }

  return (
    <main className="page">
      <PageHeader
        title="Wiederkehrend"
        subtitle="Wartung / Reinigung / Hausmeister — Vorlagen mit Pauschale → fällige Aufträge"
        action={
          <div className="toolbarRight">
            <button className="secondaryBtn" onClick={generate} disabled={generating || customers.length === 0}>
              {generating ? "Erzeuge…" : "Fällige Aufträge erzeugen"}
            </button>
            <button className="primaryBtn" onClick={openNew} disabled={customers.length === 0}>
              + Neue Vorlage
            </button>
          </div>
        }
      />
      
      {customers.length === 0 && (
        <div className="notice">
          Lege zuerst mindestens einen Kunden an.{" "}
          <Link className="textLink" href="/kunden">
            Zu Kunden →
          </Link>
        </div>
      )}
      {cloudError && <div className="loginError pageError">{cloudError}</div>}
      {genMsg && <div className="notice">{genMsg}</div>}

      <div className="statsGrid">
        <StatCard label="Vorlagen" value={String(recurringTemplates.length)} hint="Gesamt" />
        <StatCard label="Aktiv" value={String(activeCount)} hint="Eingeschaltet" />
        <StatCard label="Fällig" value={String(dueCount)} hint="nächster Lauf ≤ heute" />
        <StatCard label="Plantafel" value="→" hint="Erzeugte Jobs unter Aufträge / Plantafel" />
      </div>

      <div className="toolbar">
        <div className="toolbarLeft">
          <input
            className="searchInput"
            placeholder="Titel, Kunde, Notiz, Rhythmus..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbarRight">
          <span className="cellSub">{filtered.length} Vorlagen</span>
          <Link className="textLink" href="/auftraege">
            Aufträge →
          </Link>
          <Link className="textLink" href="/plantafel">
            Plantafel →
          </Link>
        </div>
      </div>

      {cloudLoading ? (
        <LoadingState label="Vorlagen werden geladen…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Noch keine Service-Vorlagen"
          hint="Typisch: Wartung mit einer Pauschale. Lege die erste Vorlage an."
        />
      ) : (
        <div className="serviceTemplateGrid">
          {filtered.map((t) => {
            const customer = customers.find((c) => c.id === t.customerId);
            const emp = employees.find((e) => e.id === t.defaultAssignee);
            const due = t.active && t.nextRunDate <= today;
            return (
              <article key={t.id} className={`serviceTemplateCard${t.active ? "" : " isPaused"}${due ? " isDue" : ""}`}>
                <div className="serviceTemplateTop">
                  <span className="serviceTemplateKind">Wartung</span>
                  <Badge tone={t.active ? "green" : "gray"}>{t.active ? "Aktiv" : "Pausiert"}</Badge>
                </div>
                <h3 className="serviceTemplateTitle">{t.title}</h3>
                <p className="serviceTemplateDesc">
                  {t.description || t.notes || "Keine Beschreibung"}
                </p>
                <div className="serviceTemplateMeta">
                  <span>{customer?.name ?? "—"}</span>
                  <span>·</span>
                  <span>{CADENCE_LABEL[t.cadence]}</span>
                  {t.intervalDays ? <span>(alle {t.intervalDays} Tage)</span> : null}
                </div>
                <div className="serviceTemplateBadges">
                  <span className="priceBadge">{euro(Number(t.defaultPrice ?? 0))}</span>
                  {due ? <Badge tone="orange">fällig</Badge> : null}
                </div>
                <div className="serviceTemplateFooter">
                  <span className="cellSub">
                    Nächster Lauf {formatDate(t.nextRunDate)}
                    {emp ? ` · ${emp.name}` : ""}
                  </span>
                  <div className="rowActions">
                    <button
                      className="textLink"
                      style={{ background: "none", border: 0, cursor: "pointer" }}
                      onClick={() => openEdit(t)}
                    >
                      Bearbeiten
                    </button>
                    <button
                      className="textLink"
                      style={{ background: "none", border: 0, cursor: "pointer" }}
                      onClick={() => toggleActive(t)}
                    >
                      {t.active ? "Pausieren" : "Aktivieren"}
                    </button>
                    <button className="dangerLink" onClick={() => remove(t)}>
                      Löschen
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <Modal
          title={editing ? "Vorlage bearbeiten" : "Neue Wartungs-Vorlage"}
          subtitle="Pauschale wird auf erzeugte Aufträge übernommen"
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
        >
          <form onSubmit={submit}>
            <div className="formGrid">
              <div className="formField wide">
                <label>Titel *</label>
                <input
                  className="input"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="z.B. Wartung Heizung EG"
                />
              </div>
              <div className="formField">
                <label>Kunde *</label>
                <select
                  className="select"
                  required
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                >
                  <option value="">Bitte wählen</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField">
                <label>Rhythmus</label>
                <select
                  className="select"
                  value={form.cadence}
                  onChange={(e) => setForm({ ...form, cadence: e.target.value as RecurringCadence })}
                >
                  <option value="weekly">Wöchentlich</option>
                  <option value="biweekly">Alle 2 Wochen</option>
                  <option value="monthly">Monatlich</option>
                </select>
              </div>
              <div className="formField">
                <label>Pauschale (€)</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.defaultPrice}
                  onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })}
                  placeholder="20"
                />
              </div>
              <div className="formField">
                <label>Intervall (Tage, optional)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.intervalDays}
                  onChange={(e) => setForm({ ...form, intervalDays: e.target.value })}
                  placeholder="leer = Rhythmus"
                />
              </div>
              <div className="formField">
                <label>Nächster Lauf</label>
                <input
                  className="input"
                  type="date"
                  value={form.nextRunDate}
                  onChange={(e) => setForm({ ...form, nextRunDate: e.target.value })}
                />
              </div>
              <div className="formField">
                <label>Uhrzeit</label>
                <input
                  className="input"
                  type="time"
                  value={form.defaultTime}
                  onChange={(e) => setForm({ ...form, defaultTime: e.target.value })}
                />
              </div>
              <div className="formField">
                <label>Techniker</label>
                <select
                  className="select"
                  value={form.defaultAssignee}
                  onChange={(e) => setForm({ ...form, defaultAssignee: e.target.value })}
                >
                  <option value="">Nicht zugewiesen</option>
                  {employees
                    .filter((e) => e.active)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="formField">
                <label>Priorität</label>
                <select
                  className="select"
                  value={form.defaultPriority}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultPriority: e.target.value as RecurringJobTemplate["defaultPriority"],
                    })
                  }
                >
                  <option>Normal</option>
                  <option>Hoch</option>
                  <option>Notfall</option>
                </select>
              </div>
              <div className="formField">
                <label>Geschätzte Stunden</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.estimatedHours}
                  onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })}
                />
              </div>
              <div className="formField">
                <label>Aktiv</label>
                <select
                  className="select"
                  value={form.active ? "1" : "0"}
                  onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
                >
                  <option value="1">Ja</option>
                  <option value="0">Pausiert</option>
                </select>
              </div>
              <div className="formField wide">
                <label>Beschreibung</label>
                <textarea
                  className="textarea"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Was wird gemacht? (erscheint auf der Karte)"
                />
              </div>
              <div className="formField wide">
                <label>Notizen</label>
                <textarea
                  className="textarea"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
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
                {saving ? "Speichert..." : editing ? "Änderungen speichern" : "Vorlage speichern"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
