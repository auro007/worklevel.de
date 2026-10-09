"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, EmptyState, LoadingState, Modal, PageHeader, StatCard } from "@/components/UI";
import { getSupabaseClient } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyProvider";
import { useAppData } from "@/context/AppDataProvider";
import { formatCloudError } from "@/lib/utils";

type DeviceType = "Heizung" | "Solar" | "Warmwasser" | "Lüftung" | "Klima" | "Sanitär" | "Sonstiges";

type Device = {
  id: string;
  customer_id: number;
  customer_site_id: string | null;
  name: string;
  device_type: string;
  serial_number: string | null;
  model: string | null;
  notes: string | null;
  plan_path: string | null;
  plan_url: string | null;
  active: boolean;
  planSignedUrl?: string | null;
};

const TYPES: DeviceType[] = ["Heizung", "Solar", "Warmwasser", "Lüftung", "Klima", "Sanitär", "Sonstiges"];

const blank = {
  customerId: "",
  siteId: "",
  name: "",
  type: "Heizung" as DeviceType,
  serial: "",
  model: "",
  notes: "",
  planUrl: "",
  active: true,
};

export default function GeraetePage() {
  const { company } = useCompany();
  const { customers, customerSites } = useAppData();
  const [rows, setRows] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(blank);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"Alle" | DeviceType>("Alle");
  const [customerFilter, setCustomerFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [clearPlan, setClearPlan] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const sitesForForm = useMemo(
    () => customerSites.filter((s) => s.customerId === f.customerId && s.active),
    [customerSites, f.customerId]
  );

  async function resolvePlans(list: Device[]): Promise<Device[]> {
    const s = getSupabaseClient();
    if (!s) return list;
    return Promise.all(
      list.map(async (d) => {
        if (!d.plan_path) return { ...d, planSignedUrl: null };
        const { data } = await s.storage.from("device-plans").createSignedUrl(d.plan_path, 3600);
        return { ...d, planSignedUrl: data?.signedUrl ?? null };
      })
    );
  }

  async function load() {
    const s = getSupabaseClient();
    if (!s || !company) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const r = await s
      .from("site_devices")
      .select("*")
      .eq("company_id", company.id)
      .order("active", { ascending: false })
      .order("name");
    if (r.error) setError(formatCloudError(r.error.message));
    else setRows(await resolvePlans((r.data ?? []) as Device[]));
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
      if (typeFilter !== "Alle" && row.device_type !== typeFilter) return false;
      if (customerFilter && String(row.customer_id) !== customerFilter) return false;
      if (!q) return true;
      const customer = customers.find((c) => c.id === String(row.customer_id));
      const site = row.customer_site_id ? customerSites.find((s) => s.id === row.customer_site_id) : undefined;
      const hay = `${row.name} ${row.device_type} ${row.serial_number ?? ""} ${row.model ?? ""} ${row.notes ?? ""} ${customer?.name ?? ""} ${site?.name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, typeFilter, customerFilter, activeOnly, customers, customerSites]);

  function openNew() {
    setEditing(null);
    setF({ ...blank, customerId: customers[0]?.id ?? "" });
    setPlanFile(null);
    setClearPlan(false);
    setUploadStatus("");
    setOpen(true);
  }

  function openEdit(d: Device) {
    setEditing(d);
    setF({
      customerId: String(d.customer_id),
      siteId: d.customer_site_id ?? "",
      name: d.name,
      type: (TYPES.includes(d.device_type as DeviceType) ? d.device_type : "Sonstiges") as DeviceType,
      serial: d.serial_number ?? "",
      model: d.model ?? "",
      notes: d.notes ?? "",
      planUrl: d.plan_url ?? "",
      active: d.active,
    });
    setPlanFile(null);
    setClearPlan(false);
    setUploadStatus("");
    setOpen(true);
  }

  async function uploadPlan(deviceId: string, file: File): Promise<string> {
    const s = getSupabaseClient();
    if (!s || !company) throw new Error("Kein Firmenkontext.");
    setUploadStatus("Plan wird hochgeladen…");
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${company.id}/devices/${deviceId}/${Date.now()}-${safe}`;
    const up = await s.storage.from("device-plans").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) throw new Error(up.error.message);
    return path;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const s = getSupabaseClient();
    if (!s || !company) return;
    if (!f.name.trim() || !f.customerId) return;
    setSaving(true);
    setError("");
    setUploadStatus("");
    const payload: Record<string, unknown> = {
      customer_id: Number(f.customerId),
      customer_site_id: f.siteId || null,
      name: f.name.trim(),
      device_type: f.type,
      serial_number: f.serial.trim() || null,
      model: f.model.trim() || null,
      notes: f.notes.trim() || null,
      plan_url: f.planUrl.trim() || null,
      active: f.active,
    };
    if (clearPlan) {
      payload.plan_path = null;
    }
    try {
      let deviceId = editing?.id;
      if (editing) {
        const r = await s
          .from("site_devices")
          .update(payload)
          .eq("id", editing.id)
          .eq("company_id", company.id);
        if (r.error) throw new Error(r.error.message);
      } else {
        const r = await s
          .from("site_devices")
          .insert({ ...payload, company_id: company.id })
          .select("id")
          .single();
        if (r.error) throw new Error(r.error.message);
        deviceId = r.data.id as string;
      }
      if (planFile && deviceId) {
        const path = await uploadPlan(deviceId, planFile);
        const u = await s
          .from("site_devices")
          .update({ plan_path: path })
          .eq("id", deviceId)
          .eq("company_id", company.id);
        if (u.error) throw new Error(u.error.message);
      }
      setOpen(false);
      setEditing(null);
      setF(blank);
      setPlanFile(null);
      await load();
    } catch (err) {
      setError(formatCloudError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
      setUploadStatus("");
    }
  }

  async function toggleActive(d: Device) {
    const s = getSupabaseClient();
    if (!s || !company) return;
    const r = await s
      .from("site_devices")
      .update({ active: !d.active })
      .eq("id", d.id)
      .eq("company_id", company.id);
    if (r.error) setError(formatCloudError(r.error.message));
    else await load();
  }

  async function remove(d: Device) {
    if (!confirm(`Gerät „${d.name}“ löschen?`)) return;
    const s = getSupabaseClient();
    if (!s || !company) return;
    const r = await s.from("site_devices").delete().eq("id", d.id).eq("company_id", company.id);
    if (r.error) setError(formatCloudError(r.error.message));
    else await load();
  }

  return (
    <main className="page">
      <PageHeader
        title="Geräte & Pläne"
        subtitle="Anlagen am Kunden / Objekt — Heizung, Solar, Pläne für den Einsatz"
        action={
          <button className="primaryBtn" onClick={openNew} disabled={customers.length === 0}>
            + Neues Gerät
          </button>
        }
      />
      <div className="cloudNotice">
        <span className="cloudDot" /> Geräte gehören zum Kunden (optional Objekt). Techniker sehen Geräte am Auftrag.{" "}
        <Link className="textLink" href="/kunden">
          Kunden / Objekte
        </Link>
      </div>
      {customers.length === 0 && <div className="notice">Lege zuerst einen Kunden an, dann Geräte.</div>}
      {error && <div className="loginError pageError">{error}</div>}

      <div className="statsGrid" style={{ marginBottom: 16 }}>
        <StatCard label="Geräte" value={String(rows.length)} />
        <StatCard label="Aktiv" value={String(rows.filter((r) => r.active).length)} />
        <StatCard label="Gefiltert" value={String(filtered.length)} />
      </div>

      <div className="toolbar">
        <div className="toolbarLeft">
          <input
            className="searchInput"
            placeholder="Name, Typ, Seriennr., Kunde, Objekt…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
            <option value="Alle">Alle Typen</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select className="select" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
            <option value="">Alle Kunden</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Nur aktive
          </label>
        </div>
        <div className="toolbarRight">
          <span className="cellSub">{filtered.length} Geräte</span>
        </div>
      </div>

      <div className="tableWrap">
        {loading ? (
          <LoadingState label="Geräte werden geladen…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={query || typeFilter !== "Alle" || customerFilter ? "Keine Treffer" : "Noch keine Geräte"}
            hint={
              query || typeFilter !== "Alle"
                ? "Suche oder Filter anpassen."
                : "Lege das erste Gerät mit „+ Neues Gerät“ an — z. B. Heizkessel Haus 1."
            }
          />
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Gerät</th>
                <th>Kunde / Objekt</th>
                <th>Typ</th>
                <th>Plan</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const customer = customers.find((c) => c.id === String(d.customer_id));
                const site = d.customer_site_id ? customerSites.find((s) => s.id === d.customer_site_id) : undefined;
                const planHref = d.planSignedUrl || d.plan_url || "";
                return (
                  <tr key={d.id}>
                    <td>
                      <span className="cellTitle">{d.name}</span>
                      {(d.model || d.serial_number) && (
                        <span className="cellSub">
                          {[d.model, d.serial_number ? `S/N ${d.serial_number}` : ""].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {d.notes ? <span className="cellSub">{d.notes}</span> : null}
                    </td>
                    <td>
                      {customer?.name ?? "—"}
                      {site ? <span className="cellSub">{site.name}</span> : <span className="cellSub">ohne Objekt</span>}
                    </td>
                    <td>{d.device_type}</td>
                    <td>
                      {planHref ? (
                        <a className="textLink" href={planHref} target="_blank" rel="noreferrer">
                          Plan öffnen
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Badge tone={d.active ? "green" : "gray"}>{d.active ? "Aktiv" : "Inaktiv"}</Badge>
                    </td>
                    <td>
                      <div className="rowActions">
                        <button className="textLink" type="button" onClick={() => openEdit(d)}>
                          Bearbeiten
                        </button>
                        <button className="textLink" type="button" onClick={() => void toggleActive(d)}>
                          {d.active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button className="dangerLink" type="button" onClick={() => void remove(d)}>
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal
          title={editing ? "Gerät bearbeiten" : "Neues Gerät"}
          subtitle="Kunde → optional Objekt → Typ, Seriennr., Plan"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={save}>
            <div className="formGrid">
              <div className="formField">
                <label>Kunde *</label>
                <select
                  className="select"
                  required
                  value={f.customerId}
                  onChange={(e) => setF({ ...f, customerId: e.target.value, siteId: "" })}
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
                <label>Objekt</label>
                <select
                  className="select"
                  value={f.siteId}
                  onChange={(e) => setF({ ...f, siteId: e.target.value })}
                  disabled={!f.customerId}
                >
                  <option value="">Kein Objekt</option>
                  {sitesForForm.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField wide">
                <label>Bezeichnung *</label>
                <input
                  className="input"
                  required
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                  placeholder="z. B. Heizkessel EG"
                />
              </div>
              <div className="formField">
                <label>Typ</label>
                <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as DeviceType })}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField">
                <label>Modell</label>
                <input className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
              </div>
              <div className="formField">
                <label>Seriennummer</label>
                <input className="input" value={f.serial} onChange={(e) => setF({ ...f, serial: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>Notizen</label>
                <textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>Plan-URL (extern, optional)</label>
                <input
                  className="input"
                  value={f.planUrl}
                  onChange={(e) => setF({ ...f, planUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="formField wide">
                <label>Plan-Datei (PDF / Bild)</label>
                <input
                  className="input"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    setPlanFile(e.target.files?.[0] ?? null);
                    setClearPlan(false);
                  }}
                />
                {editing?.plan_path && !planFile && (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <input type="checkbox" checked={clearPlan} onChange={(e) => setClearPlan(e.target.checked)} />
                    Hochgeladenen Plan entfernen
                  </label>
                )}
                {uploadStatus && <span className="cellSub">{uploadStatus}</span>}
              </div>
              <div className="formField">
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
