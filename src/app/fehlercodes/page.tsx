"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, EmptyState, LoadingState, Modal, PageHeader, StatCard } from "@/components/UI";
import FehlercodeImport from "@/components/FehlercodeImport";
import { getSupabaseClient } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyProvider";
import { formatCloudError } from "@/lib/utils";
import { readAllRows } from "@/lib/readAllRows";

type TradeCategory = "Heizung" | "Sanitär" | "Lüftung" | "Klima" | "Sonstiges" | "";

type Row = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  trade_category: string | null;
  device_name: string | null;
  active: boolean;
};

const TRADES: Exclude<TradeCategory, "">[] = ["Heizung", "Sanitär", "Lüftung", "Klima", "Sonstiges"];

const blank = { code: "", title: "", description: "", trade: "Heizung" as TradeCategory, device: "", active: true };

export default function FehlercodesPage() {
  const { company } = useCompany();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(blank);
  const [query, setQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState<"Alle" | Exclude<TradeCategory, "">>("Alle");
  const [deviceFilter, setDeviceFilter] = useState("Alle");
  const [activeOnly, setActiveOnly] = useState(true);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    const s = getSupabaseClient();
    if (!s || !company) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const r = await readAllRows((from, to) => s
      .from("error_codes")
      .select("*")
      .eq("company_id", company.id)
      .order("active", { ascending: false })
      .order("code")
      .order("id")
      .range(from, to));
    if (r.error) setError(formatCloudError(r.error.message));
    else setRows((r.data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (activeOnly && !row.active) return false;
      if (tradeFilter !== "Alle" && (row.trade_category || "") !== tradeFilter) return false;
      if (deviceFilter !== "Alle" && (row.device_name || "") !== deviceFilter) return false;
      if (!q) return true;
      const hay = `${row.code} ${row.title} ${row.description ?? ""} ${row.trade_category ?? ""} ${row.device_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, tradeFilter, deviceFilter, activeOnly]);

  const deviceNames = useMemo(
    () => [...new Set(rows.map((row) => (row.device_name || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de")),
    [rows],
  );

  const activeCount = rows.filter((r) => r.active).length;
  const knownCodes = f.code.trim() ? rows.filter(r => r.id !== editing?.id && r.code.trim().toLowerCase() === f.code.trim().toLowerCase() && (r.device_name || "").trim().toLowerCase() === f.device.trim().toLowerCase()) : [];

  function openNew() {
    setEditing(null);
    setF(blank);
    setOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    setF({
      code: row.code,
      title: row.title,
      description: row.description ?? "",
      trade: (row.trade_category as TradeCategory) || "",
      device: row.device_name ?? "",
      active: row.active,
    });
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const s = getSupabaseClient();
    if (!s || !company) return;
    if (!f.code.trim() || !f.title.trim()) return;
    setSaving(true);
    setError("");
    const payload = {
      code: f.code.trim().toUpperCase(),
      title: f.title.trim(),
      description: f.description.trim() || null,
      trade_category: f.trade || null,
      device_name: f.device.trim() || null,
      active: f.active,
    };
    try {
      if (editing) {
        const r = await s
          .from("error_codes")
          .update(payload)
          .eq("id", editing.id)
          .eq("company_id", company.id);
        if (r.error) throw new Error(r.error.message);
      } else {
        const r = await s.from("error_codes").insert({ ...payload, company_id: company.id });
        if (r.error) throw new Error(r.error.message);
      }
      setOpen(false);
      setEditing(null);
      setF(blank);
      await load();
    } catch (err) {
      setError(formatCloudError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: Row) {
    const s = getSupabaseClient();
    if (!s || !company) return;
    const r = await s
      .from("error_codes")
      .update({ active: !row.active })
      .eq("id", row.id)
      .eq("company_id", company.id);
    if (r.error) setError(formatCloudError(r.error.message));
    else await load();
  }

  async function remove(row: Row) {
    const s = getSupabaseClient();
    if (!s || !company) return;
    setSaving(true);
    const r = await s.from("error_codes").delete().eq("id", row.id).eq("company_id", company.id).select("id").single();
    if (r.error) setError(formatCloudError(r.error.message));
    else { setRemoving(null); await load(); }
    setSaving(false);
  }

  return (
    <main className="page">
      <PageHeader
        title="Fehlercodes"
        subtitle="Kundendienst-Katalog — Code, Titel, Beschreibung (Techniker können nachschlagen)"
        action={
          <div className="headerActions">
            <button className="ghostBtn" type="button" onClick={() => setImporting(true)}>CSV / PDF importieren</button>
            <button className="primaryBtn" type="button" onClick={openNew}>+ Neuer Code</button>
          </div>
        }
      />
      <div className="cloudNotice">
        <span className="cloudDot" /> Firmenkatalog. Techniker sehen aktive Codes auf dem Auftrag und können einen Code anhängen.
      </div>
      {error && <div className="loginError pageError">{error}</div>}
      {importing && company && (
        <FehlercodeImport
          companyId={company.id}
          deviceNames={deviceNames}
          onClose={() => setImporting(false)}
          onDone={() => { void load(); }}
        />
      )}
      {removing && <Modal title="Fehlercode löschen" onClose={() => !saving && setRemoving(null)}>
        <p>„{removing.code} – {removing.title}“ löschen? Der Bezug in Aufträgen wird entfernt.</p>
        {error && <p className="loginError" role="alert">{error}</p>}
        <div className="formActions"><button className="ghostBtn" disabled={saving} onClick={() => setRemoving(null)}>Abbrechen</button><button className="primaryBtn" disabled={saving} onClick={() => void remove(removing)}>Löschen</button></div>
      </Modal>}

      <div className="statsGrid" style={{ marginBottom: 16 }}>
        <StatCard label="Codes gesamt" value={String(rows.length)} />
        <StatCard label="Aktiv" value={String(activeCount)} />
        <StatCard label="Gefiltert" value={String(filtered.length)} />
      </div>

      <div className="toolbar">
        <div className="toolbarLeft">
          <input
            className="searchInput"
            placeholder="Code, Titel, Beschreibung…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="select"
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value as typeof tradeFilter)}
          >
            <option value="Alle">Alle Gewerke</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Gerät filtern" value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)}>
            <option value="Alle">Alle Geräte</option>
            {deviceNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <label className="checkInline" style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Nur aktive
          </label>
        </div>
        <div className="toolbarRight">
          <span className="cellSub">{filtered.length} Codes</span>
        </div>
      </div>

      <div className="tableWrap">
        {loading ? (
          <LoadingState label="Fehlercodes werden geladen…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={query || tradeFilter !== "Alle" || deviceFilter !== "Alle" || activeOnly ? "Keine Treffer" : "Noch keine Fehlercodes"}
            hint={
              query || tradeFilter !== "Alle" || deviceFilter !== "Alle"
                ? "Suche oder Filter anpassen."
                : "Importiere eine CSV- oder PDF-Liste, oder lege den ersten Code mit „+ Neuer Code“ an."
            }
          />
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Code</th>
                <th>Titel</th>
                <th>Gerät</th>
                <th>Gewerk</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="cellTitle">{row.code}</span>
                  </td>
                  <td>
                    <span className="cellTitle">{row.title}</span>
                    {row.description ? <span className="cellSub">{row.description}</span> : null}
                  </td>
                  <td>{row.device_name || "—"}</td>
                  <td>{row.trade_category || "—"}</td>
                  <td>
                    <Badge tone={row.active ? "green" : "gray"}>{row.active ? "Aktiv" : "Inaktiv"}</Badge>
                  </td>
                  <td>
                    <div className="rowActions">
                      <button className="textLink" type="button" onClick={() => openEdit(row)}>
                        Bearbeiten
                      </button>
                      <button className="textLink" type="button" onClick={() => void toggleActive(row)}>
                        {row.active ? "Deaktivieren" : "Aktivieren"}
                      </button>
                      <button className="dangerLink" type="button" onClick={() => {setError("");setRemoving(row);}}>
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
          title={editing ? "Fehlercode bearbeiten" : "Neuer Fehlercode"}
          subtitle="Kurzcode + Titel — Beschreibung hilft dem Techniker vor Ort"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={save}>
            <div className="formGrid">
              <div className="formField">
                <label>Code *</label>
                <input
                  className="input"
                  required
                  value={f.code}
                  onChange={(e) => setF({ ...f, code: e.target.value })}
                  placeholder="z. B. E01"
                />
              </div>
              <div className="formField">
                <label>Gewerk</label>
                <select className="select" value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value as TradeCategory })}>
                  <option value="">— optional —</option>
                  {TRADES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField wide">
                <label>Gerät / Heizung</label>
                <input
                  className="input"
                  list="fehlercode-form-devices"
                  value={f.device}
                  onChange={(e) => setF({ ...f, device: e.target.value })}
                  placeholder="z. B. Vaillant ecoTEC plus"
                />
                <datalist id="fehlercode-form-devices">
                  {deviceNames.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
              {!editing && f.code.trim() && <div className="formField wide" role="status">
                {knownCodes.length ? knownCodes.map(row => <div key={row.id}><strong>{row.code}: {row.title}</strong><p>{row.description}</p><button type="button" className="ghostBtn" onClick={() => openEdit(row)}>Vorhandenen Eintrag bearbeiten</button></div>) : <p>Für diesen Code ist noch keine Erklärung gespeichert. Bedeutung und Prüfschritte bitte anhand der Geräteunterlagen ergänzen; Fehlercodes unterscheiden sich je nach Hersteller und Modell.</p>}
              </div>}
              <div className="formField wide">
                <label>Titel *</label>
                <input
                  className="input"
                  required
                  value={f.title}
                  onChange={(e) => setF({ ...f, title: e.target.value })}
                  placeholder="z. B. Keine Wärme"
                />
              </div>
              <div className="formField wide">
                <label>Beschreibung</label>
                <textarea
                  className="textarea"
                  value={f.description}
                  onChange={(e) => setF({ ...f, description: e.target.value })}
                  placeholder="Ursache, Prüfschritte, Hinweise…"
                />
              </div>
              <div className="formField">
                <label className="checkInline" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />
                  Aktiv
                </label>
              </div>
            </div>
            <div className="formActions">
              <button type="button" className="ghostBtn" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
              <button className="primaryBtn" disabled={saving}>
                {saving ? "Speichert…" : "Speichern"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
