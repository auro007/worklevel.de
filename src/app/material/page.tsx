"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, EmptyState, LoadingState, Modal, PageHeader, StatCard } from "@/components/UI";
import { getSupabaseClient } from "@/lib/supabase";
import { useCompany } from "@/context/CompanyProvider";
import { euro, formatCloudError } from "@/lib/utils";
import { compressImageFile } from "@/lib/compressImage";
import MaterialImport from "@/components/MaterialImport";
import { readAllRows } from "@/lib/readAllRows";

type TradeCategory = "Heizung" | "Sanitär" | "Lüftung" | "Klima" | "Sonstiges";

type M = {
  id: string;
  sku: string | null;
  name: string;
  unit: string;
  purchase_price: number;
  sales_price: number;
  stock: number;
  min_stock: number;
  supplier_id: string | null;
  active: boolean;
  trade_category: TradeCategory;
  keywords: string[] | null;
  image_path: string | null;
  thumbUrl?: string | null;
};

type S = { id: string; name: string };

const TRADES: TradeCategory[] = ["Heizung", "Sanitär", "Lüftung", "Klima", "Sonstiges"];

const blank = {
  sku: "",
  name: "",
  unit: "Stk.",
  purchase: "0",
  sales: "0",
  stock: "0",
  min: "0",
  supplier: "",
  trade: "Sonstiges" as TradeCategory,
  keywords: "",
};

const PIECE_UNIT = /^(stk\.?|stück|stueck|st\.?)$/i;

function qty(n: number, unit?: string) {
  const value = Number(n);
  if (!Number.isFinite(value)) return "0";
  if (unit && PIECE_UNIT.test(unit.trim())) return Math.round(value).toLocaleString("de-DE");
  return value.toLocaleString("de-DE", { maximumFractionDigits: 3 });
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function keywordsLabel(kw: string[] | null | undefined): string {
  if (!kw || !kw.length) return "";
  return kw.join(", ");
}

export default function MaterialPage() {
  const { company } = useCompany();
  const [rows, setRows] = useState<M[]>([]);
  const [suppliers, setSuppliers] = useState<S[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<M | null>(null);
  const [adjusting, setAdjusting] = useState<M | null>(null);
  const [adjust, setAdjust] = useState({ quantity: "", note: "Bestandskorrektur" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoStatus, setPhotoStatus] = useState("");
  const [f, setF] = useState(blank);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [clearImage, setClearImage] = useState(false);

  const [tradeFilter, setTradeFilter] = useState<"Alle" | TradeCategory>("Alle");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [keywordQuery, setKeywordQuery] = useState("");
  const [groupBySupplier, setGroupBySupplier] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [showArchived, setShowArchived] = useState(false);
  const [removing, setRemoving] = useState<M | null>(null);
  const [importing, setImporting] = useState(false);

  async function resolveThumbs(list: M[]): Promise<M[]> {
    const s = getSupabaseClient();
    if (!s) return list;
    return Promise.all(
      list.map(async (m) => {
        if (!m.image_path) return { ...m, thumbUrl: null };
        const { data } = await s.storage.from("material-files").createSignedUrl(m.image_path, 3600);
        return { ...m, thumbUrl: data?.signedUrl ?? null };
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
    const [m, sp] = await Promise.all([
      readAllRows((from, to) => s
        .from("inventory_materials")
        .select("*")
        .eq("company_id", company.id)
        .order("active", { ascending: false })
        .order("name").order("id").range(from, to)),
      readAllRows((from, to) => s
        .from("suppliers")
        .select("id,name")
        .eq("company_id", company.id)
        .eq("active", true)
        .order("name").order("id").range(from, to)),
    ]);
    if (m.error) setError(formatCloudError(m.error.message));
    else {
      const raw = (m.data ?? []).map((row: Record<string, unknown>) => ({
        ...(row as unknown as M),
        trade_category: (TRADES.includes(row.trade_category as TradeCategory)
          ? row.trade_category
          : "Sonstiges") as TradeCategory,
        keywords: Array.isArray(row.keywords) ? (row.keywords as string[]) : [],
        image_path: (row.image_path as string | null) ?? null,
      }));
      setRows(await resolveThumbs(raw));
    }
    if (!sp.error) setSuppliers((sp.data ?? []) as S[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  function newMaterial() {
    setEditing(null);
    setF(blank);
    setImageFile(null);
    setImagePreview(null);
    setClearImage(false);
    setPhotoStatus("");
    setOpen(true);
  }

  function edit(m: M) {
    setEditing(m);
    setF({
      sku: m.sku || "",
      name: m.name,
      unit: m.unit,
      purchase: String(m.purchase_price),
      sales: String(m.sales_price),
      stock: String(m.stock),
      min: String(m.min_stock),
      supplier: m.supplier_id || "",
      trade: m.trade_category || "Sonstiges",
      keywords: keywordsLabel(m.keywords),
    });
    setImageFile(null);
    setImagePreview(m.thumbUrl || null);
    setClearImage(false);
    setPhotoStatus("");
    setOpen(true);
  }

  async function uploadMaterialImage(materialId: string, file: File): Promise<string> {
    const s = getSupabaseClient();
    if (!s || !company) throw new Error("Kein Firmenkontext.");
    setPhotoStatus("Bild wird komprimiert…");
    const compressed = await compressImageFile(file, { maxEdge: 1200, quality: 0.72 });
    const safe = compressed.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${company.id}/materials/${materialId}/${Date.now()}-${safe}`;
    setPhotoStatus("Bild wird hochgeladen…");
    const up = await s.storage.from("material-files").upload(path, compressed.blob, {
      contentType: compressed.blob.type || "image/jpeg",
      upsert: false,
    });
    if (up.error) throw new Error(up.error.message);
    return path;
  }

  function validUnit(value: string) {
    const v = value.trim();
    if (!v) return false;
    if (/^\d+(?:[.,]\d+)?$/.test(v)) return false;
    if (/^stk\.?\d+/i.test(v)) return false;
    return /^[A-Za-zÄÖÜäöüßµ²³/% .-]{1,20}$/.test(v);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const s = getSupabaseClient();
    if (!s || !company) return;
    setError("");
    setSaving(true);
    setPhotoStatus("");
    if (!validUnit(f.unit)) { setError("Ungültige Mengeneinheit. Beispiele: Stk., m, kg, l, m²."); setSaving(false); return; }
    const data: Record<string, unknown> = {
      sku: f.sku || null,
      name: f.name,
      unit: f.unit || "Stk.",
      purchase_price: Number(f.purchase) || 0,
      sales_price: Number(f.sales) || 0,
      min_stock: Number(f.min) || 0,
      supplier_id: f.supplier || null,
      trade_category: f.trade || "Sonstiges",
      keywords: parseKeywords(f.keywords),
    };
    if (clearImage) data.image_path = null;

    try {
      let materialId = editing?.id;
      if (editing) {
        const r = await s
          .from("inventory_materials")
          .update(data)
          .eq("id", editing.id)
          .eq("company_id", company.id);
        if (r.error) throw new Error(r.error.message);
      } else {
        const r = await s
          .from("inventory_materials")
          .insert({ ...data, company_id: company.id, stock: Number(f.stock) || 0 })
          .select("id")
          .single();
        if (r.error) throw new Error(r.error.message);
        materialId = r.data.id as string;
      }

      if (imageFile && materialId) {
        const path = await uploadMaterialImage(materialId, imageFile);
        const u = await s
          .from("inventory_materials")
          .update({ image_path: path })
          .eq("id", materialId)
          .eq("company_id", company.id);
        if (u.error) throw new Error(u.error.message);
      }

      setOpen(false);
      setEditing(null);
      setF(blank);
      setImageFile(null);
      setImagePreview(null);
      setClearImage(false);
      setPhotoStatus("");
      await load();
    } catch (err) {
      setError(formatCloudError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
      setPhotoStatus("");
    }
  }

  async function archive(m: M) {
    const s = getSupabaseClient();
    if (!s || !company) return;
    const r = await s
      .from("inventory_materials")
      .update({ active: !m.active })
      .eq("id", m.id)
      .eq("company_id", company.id);
    if (r.error) setError(formatCloudError(r.error.message));
    else load();
  }

  async function remove(m: M) {
    const s = getSupabaseClient();
    if (!s || !company) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
    const [po, mv, jm] = await Promise.all([
      s.from("purchase_order_items").select("id", { count: "exact", head: true }).eq("material_id", m.id),
      s.from("inventory_movements").select("id", { count: "exact", head: true }).eq("material_id", m.id),
      s.from("job_materials").select("id", { count: "exact", head: true }).eq("inventory_material_id", m.id),
    ]);
    const lookupError = po.error || mv.error || jm.error;
    if (lookupError) throw new Error(lookupError.message);
    const used = (po.count || 0) + (mv.count || 0) + (jm.count || 0) > 0;
    const action = used ? s.from("inventory_materials").update({active:false}) : s.from("inventory_materials").delete();
    const r = await action.eq("id",m.id).eq("company_id",company.id).select("id").single();
    if (r.error) throw new Error(r.error.message);
    setNotice(used ? `${m.name} wurde archiviert, weil dazu schon Bestellungen, Bewegungen oder Aufträge existieren.` : `${m.name} wurde gelöscht.`);
    setRemoving(null);
    await load();
    } catch (err) { setError(formatCloudError(err instanceof Error ? err.message : String(err))); }
    finally { setSaving(false); }
  }

  async function correctStock(e: FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    const s = getSupabaseClient();
    if (!s) return;
    const delta = Number(adjust.quantity);
    if (!delta) {
      setError("Bitte eine Korrekturmenge eingeben, z. B. 5 oder -2.");
      return;
    }
    const r = await s.rpc("adjust_inventory_stock", {
      p_material: adjusting.id,
      p_quantity: delta,
      p_note: adjust.note || "Bestandskorrektur",
    });
    if (r.error) setError(formatCloudError(r.error.message));
    else {
      setAdjusting(null);
      setAdjust({ quantity: "", note: "Bestandskorrektur" });
      load();
    }
  }

  const supplierName = (id: string | null) =>
    id ? suppliers.find((x) => x.id === id)?.name || "—" : "Ohne Händler";

  const filtered = useMemo(() => {
    const q = keywordQuery.trim().toLowerCase();
    return rows.filter((m) => {
      if (!showArchived && !m.active) return false;
      if (tradeFilter !== "Alle" && (m.trade_category || "Sonstiges") !== tradeFilter) return false;
      if (supplierFilter === "__none__") {
        if (m.supplier_id) return false;
      } else if (supplierFilter && (m.supplier_id || "") !== supplierFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [
        m.name,
        m.sku || "",
        m.trade_category || "",
        supplierName(m.supplier_id),
        ...(m.keywords || []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    }).sort((a,b) => {
      if (sortBy === "purchase-asc") return Number(a.purchase_price)-Number(b.purchase_price);
      if (sortBy === "purchase-desc") return Number(b.purchase_price)-Number(a.purchase_price);
      if (sortBy === "sales-asc") return Number(a.sales_price)-Number(b.sales_price);
      if (sortBy === "sales-desc") return Number(b.sales_price)-Number(a.sales_price);
      if (sortBy === "supplier") return supplierName(a.supplier_id).localeCompare(supplierName(b.supplier_id),"de") || Number(a.purchase_price)-Number(b.purchase_price);
      return a.name.localeCompare(b.name,"de");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tradeFilter, supplierFilter, keywordQuery, suppliers, showArchived, sortBy]);

  const grouped = useMemo(() => {
    if (!groupBySupplier) return null;
    const map = new Map<string, M[]>();
    for (const m of filtered) {
      const key = m.supplier_id || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()].sort((a, b) =>
      supplierName(a[0] === "__none__" ? null : a[0]).localeCompare(
        supplierName(b[0] === "__none__" ? null : b[0]),
        "de"
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, groupBySupplier, suppliers]);

  const active = rows.filter((x) => x.active);
  const value = active.reduce((a, m) => a + Number(m.stock) * Number(m.purchase_price), 0);
  const needsReorder = (m: M) => Number(m.min_stock) > 0 && Number(m.stock) <= Number(m.min_stock);
  const underPurchase = (m: M) => Number(m.sales_price) < Number(m.purchase_price);
  const low = active.filter(needsReorder);

  function renderRow(m: M) {
    return (
      <tr key={m.id} style={!m.active ? { opacity: 0.55 } : undefined}>
        <td>
          <div className="materialThumbCell">
            {m.thumbUrl ? (
              <img className="materialThumb" src={m.thumbUrl} alt="" />
            ) : (
              <div className="materialThumbPlaceholder" aria-hidden>
                ▤
              </div>
            )}
            <div>
              <span className="cellTitle" title={m.name}>{m.name}</span>
              <span className="cellSub">
                {m.sku || "—"}
                {!m.active ? " · Archiviert" : ""}
                {m.keywords?.length ? ` · ${m.keywords.slice(0, 4).join(", ")}` : ""}
              </span>
            </div>
          </div>
        </td>
        <td>
          <Badge tone="blue">{m.trade_category || "Sonstiges"}</Badge>
        </td>
        <td>{supplierName(m.supplier_id)}</td>
        <td>{m.unit}</td>
        <td className="money">{euro(Number(m.purchase_price))}</td>
        <td className="money">{euro(Number(m.sales_price))}{m.active && underPurchase(m) ? <span className="cellSub">VK liegt unter EK</span> : null}</td>
        <td>
          {qty(Number(m.stock), m.unit)} {m.unit}
          <span className="cellSub">Min. {qty(Number(m.min_stock), m.unit)}</span>
        </td>
        <td>
          <Badge
            tone={!m.active ? "yellow" : needsReorder(m) ? "red" : "green"}
          >
            {!m.active
              ? "Archiviert"
              : needsReorder(m)
                ? "Nachbestellen"
                : "OK"}
          </Badge>
        </td>
        <td>
          <div className="formActions">
            <button className="ghostBtn smallBtn" onClick={() => edit(m)}>
              Bearbeiten
            </button>
            <button
              className="ghostBtn smallBtn"
              onClick={() => {
                setAdjusting(m);
                setAdjust({ quantity: "", note: "Bestandskorrektur" });
              }}
            >
              Bestand ±
            </button>
            <button className="ghostBtn smallBtn" onClick={() => archive(m)}>
              {m.active ? "Archivieren" : "Aktivieren"}
            </button>
            <button className="ghostBtn smallBtn" onClick={() => setRemoving(m)}>
              Löschen
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <main className="page">
      <PageHeader
        title="Material & Lager"
        subtitle="Katalog nach Gewerk und Händler · Schlagwörter · Bilder · Bestand"
        action={
          <div className="formActions"><button className="ghostBtn" onClick={() => setImporting(true)}>PDF / CSV importieren</button>
          <button className="primaryBtn" onClick={newMaterial}>
            + Material
          </button></div>
        }
      />
      {error && <div className="loginError pageError">{error}</div>}
      {notice && <div className="sendSuccess">{notice}</div>}
      {importing && company && <MaterialImport companyId={company.id} onClose={() => setImporting(false)} onDone={() => { setGroupBySupplier(true); setSortBy("purchase-asc"); void load(); }} />}
      {removing && <Modal title="Material entfernen" onClose={() => !saving && setRemoving(null)}>
        <p>„{removing.name}“ entfernen? Bereits verwendete Materialien werden archiviert, damit vorhandene Aufträge und Belege erhalten bleiben.</p>
        {error && <p role="alert" className="loginError">{error}</p>}
        <div className="formActions"><button className="ghostBtn" disabled={saving} onClick={() => setRemoving(null)}>Abbrechen</button><button className="primaryBtn" disabled={saving} onClick={() => void remove(removing)}>{saving ? "Entfernt…" : "Entfernen"}</button></div>
      </Modal>}
      <div className="statsGrid">
        <StatCard label="Artikel" value={String(active.length)} hint="Aktive Artikel" />
        <StatCard label="Lagerwert EK" value={euro(value)} hint="Aktueller Bestand" />
        <StatCard label="Nachbestellen" value={String(low.length)} hint="Bestand unter Mindestbestand" />
      </div>

      <div className="toolbar">
        <div className="toolbarLeft">
          <input
            className="searchInput"
            placeholder="Suche: Name, SKU, Schlagwörter…"
            value={keywordQuery}
            onChange={(e) => setKeywordQuery(e.target.value)}
          />
          <select
            className="select"
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value as "Alle" | TradeCategory)}
            aria-label="Gewerk filtern"
          >
            <option value="Alle">Alle Gewerke</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            aria-label="Händler filtern"
          >
            <option value="">Alle Händler</option>
            {suppliers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
            <option value="__none__">Ohne Händler</option>
          </select>
        </div>
        <div className="toolbarRight">
          <select className="select" aria-label="Material sortieren" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">Name A–Z</option><option value="supplier">Händler, dann Einkaufspreis</option><option value="purchase-asc">Einkaufspreis aufsteigend</option><option value="purchase-desc">Einkaufspreis absteigend</option><option value="sales-asc">Verkaufspreis aufsteigend</option><option value="sales-desc">Verkaufspreis absteigend</option>
          </select>
          <label><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Archivierte anzeigen</label>
          <label className="materialGroupToggle">
            <input
              type="checkbox"
              checked={groupBySupplier}
              onChange={(e) => setGroupBySupplier(e.target.checked)}
            />
            Nach Händler gruppieren
          </label>
          <span className="cellSub">
            {filtered.length} von {rows.length}
          </span>
        </div>
      </div>

      <div className="tradeChipRow" role="tablist" aria-label="Gewerk">
        {(["Alle", ...TRADES] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`photoCatTab${tradeFilter === t ? " active" : ""}`}
            onClick={() => setTradeFilter(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="tableWrap">
        {loading ? (
          <LoadingState label="Material wird geladen…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Noch keine Materialien"
            hint="Lege den ersten Artikel mit „+ Material“ an — mit Gewerk, Schlagwörtern und optional Bild."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Keine Treffer"
            hint="Filter oder Suche anpassen — oder Gewerk / Händler zurücksetzen."
          />
        ) : groupBySupplier && grouped ? (
          grouped.map(([key, items]) => (
            <div key={key} className="materialSupplierGroup">
              <h3 className="materialSupplierHeading">
                {key === "__none__" ? "Ohne Händler" : supplierName(key)}
                <span className="cellSub"> · {items.length}</span>
              </h3>
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th>Gewerk</th>
                    <th>Händler</th>
                    <th>Mengeneinheit</th>
                    <th>EK</th>
                    <th>VK</th>
                    <th>Bestand</th>
                    <th>Status</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>{items.map(renderRow)}</tbody>
              </table>
            </div>
          ))
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Artikel</th>
                <th>Gewerk</th>
                <th>Händler</th>
                <th>Mengeneinheit</th>
                <th>EK</th>
                <th>VK</th>
                <th>Bestand</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>{filtered.map(renderRow)}</tbody>
          </table>
        )}
      </div>

      {open && (
        <Modal
          title={editing ? "Material bearbeiten" : "Material anlegen"}
          subtitle="Katalog: Gewerk, Schlagwörter, Bild, Händler und Lager"
          onClose={() => !saving && setOpen(false)}
        >
          <form onSubmit={save}>
            <div className="formGrid">
              <div className="formField">
                <label>Artikelnummer</label>
                <input
                  className="input"
                  value={f.sku}
                  onChange={(e) => setF({ ...f, sku: e.target.value })}
                />
              </div>
              <div className="formField">
                <label>Name *</label>
                <input
                  required
                  className="input"
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </div>
              <div className="formField">
                <label>Gewerk</label>
                <select
                  className="select"
                  value={f.trade}
                  onChange={(e) => setF({ ...f, trade: e.target.value as TradeCategory })}
                >
                  {TRADES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField">
                <label>Händler / Lieferant</label>
                <select
                  className="select"
                  value={f.supplier}
                  onChange={(e) => setF({ ...f, supplier: e.target.value })}
                >
                  <option value="">—</option>
                  {suppliers.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField formFieldFull">
                <label>Schlagwörter (kommagetrennt)</label>
                <input
                  className="input"
                  placeholder="z. B. Rohr, Kupfer, 15mm, Fitting"
                  value={f.keywords}
                  onChange={(e) => setF({ ...f, keywords: e.target.value })}
                />
              </div>
              <div className="formField">
                <label>Mengeneinheit (z. B. Stk., m, kg)</label>
                <select
                  className="select"
                  value={validUnit(f.unit) ? f.unit : ""}
                  onChange={(e) => setF({ ...f, unit: e.target.value })}
                >
                  <option value="" disabled>{validUnit(f.unit) ? "Einheit wählen" : `Ungültig: ${f.unit || "—"} — bitte wählen`}</option>
                  <option value="Stk.">Stk.</option><option value="m">m</option><option value="m²">m²</option>
                  <option value="kg">kg</option><option value="g">g</option><option value="l">l</option>
                  <option value="ml">ml</option><option value="Std.">Std.</option><option value="Psch.">Psch.</option>
                </select>
              </div>
              <div className="formField">
                <label>EK €</label>
                <input
                  className="input"
                  type="number"
                  step=".01"
                  value={f.purchase}
                  onChange={(e) => setF({ ...f, purchase: e.target.value })}
                />
              </div>
              <div className="formField">
                <label>VK €</label>
                <input
                  className="input"
                  type="number"
                  step=".01"
                  value={f.sales}
                  onChange={(e) => setF({ ...f, sales: e.target.value })}
                />
              </div>
              {!editing && (
                <div className="formField">
                  <label>Startbestand (Anzahl)</label>
                  <input
                    className="input"
                    type="number"
                    step=".001"
                    value={f.stock}
                    onChange={(e) => setF({ ...f, stock: e.target.value })}
                  />
                </div>
              )}
              <div className="formField">
                <label>Mindestbestand (Anzahl)</label>
                <input
                  className="input"
                  type="number"
                  step=".001"
                  value={f.min}
                  onChange={(e) => setF({ ...f, min: e.target.value })}
                />
              </div>
              <div className="formField formFieldFull">
                <label>Produktbild (optional)</label>
                <div className="materialImageUpload">
                  {imagePreview && !clearImage ? (
                    <img className="materialThumbLarge" src={imagePreview} alt="Vorschau" />
                  ) : (
                    <div className="materialThumbPlaceholder large" aria-hidden>
                      ▤
                    </div>
                  )}
                  <div className="materialImageActions">
                    <input
                      type="file"
                      accept="image/*"
                      disabled={saving}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        e.target.value = "";
                        setImageFile(file);
                        setClearImage(false);
                        if (file) setImagePreview(URL.createObjectURL(file));
                      }}
                    />
                    {(imagePreview || editing?.image_path) && (
                      <button
                        type="button"
                        className="ghostBtn smallBtn"
                        disabled={saving}
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          setClearImage(true);
                        }}
                      >
                        Bild entfernen
                      </button>
                    )}
                    {photoStatus && <span className="cellSub">{photoStatus}</span>}
                  </div>
                </div>
              </div>
            </div>
            {editing && (
              <p className="cellSub">
                Den aktuellen Bestand änderst du über „Bestand ±“, damit die Änderung protokolliert
                wird.
              </p>
            )}
            <div className="formActions">
              <button
                type="button"
                className="ghostBtn"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Abbrechen
              </button>
              <button className="primaryBtn" disabled={saving}>
                {saving ? "Speichern…" : "Speichern"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {adjusting && (
        <Modal
          title="Bestand korrigieren"
          subtitle={`${adjusting.name} · aktuell ${qty(Number(adjusting.stock), adjusting.unit)} ${adjusting.unit}`}
          onClose={() => setAdjusting(null)}
        >
          <form onSubmit={correctStock}>
            <div className="formField">
              <label>Korrekturmenge</label>
              <input
                autoFocus
                className="input"
                type="number"
                step=".001"
                placeholder="z. B. 5 oder -2"
                value={adjust.quantity}
                onChange={(e) => setAdjust({ ...adjust, quantity: e.target.value })}
              />
            </div>
            <div className="formField">
              <label>Grund</label>
              <input
                className="input"
                value={adjust.note}
                onChange={(e) => setAdjust({ ...adjust, note: e.target.value })}
              />
            </div>
            <div className="formActions">
              <button type="button" className="ghostBtn" onClick={() => setAdjusting(null)}>
                Abbrechen
              </button>
              <button className="primaryBtn">Korrektur buchen</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
