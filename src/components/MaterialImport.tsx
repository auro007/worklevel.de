"use client";

import { useState } from "react";
import { Modal } from "@/components/UI";
import { getSupabaseClient } from "@/lib/supabase";
import { importNumber, readMaterialFile } from "@/lib/materialImport";
import { readAllRows } from "@/lib/readAllRows";

const fields = { name: "Materialname", sku: "Artikelnummer", unit: "Einheit", purchase_price: "Einkaufspreis", sales_price: "Verkaufspreis", stock: "Bestand", supplier: "Händler" };
type Field = keyof typeof fields;
const emptyMap: Record<Field, number> = { name: -1, sku: -1, unit: -1, purchase_price: -1, sales_price: -1, stock: -1, supplier: -1 };
const aliases: Record<Field, RegExp> = { name: /^(material|materialname|name|bezeichnung|beschreibung|description)$/i, sku: /^(sku|artikelnummer|artikel.?nr\.?|art\.?nr\.?)$/i, unit: /^(einheit|unit|me)$/i, purchase_price: /^(ek|einkaufspreis|preis|price|nettopreis)$/i, sales_price: /^(vk|verkaufspreis)$/i, stock: /^(bestand|stock|menge)$/i, supplier: /^(händler|haendler|lieferant|supplier)$/i };

export default function MaterialImport({ companyId, onClose, onDone }: { companyId: string; onClose: () => void; onDone: () => void }) {
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState(emptyMap);
  const [header, setHeader] = useState(true);
  const [decimal, setDecimal] = useState<"," | ".">(",");
  const [supplier, setSupplier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [excluded, setExcluded] = useState<number[]>([]);
  const [batchId] = useState(() => crypto.randomUUID());
  const [ids, setIds] = useState<string[]>([]);
  const columns = Math.max(0, ...table.map(r => r.length));

  async function read(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setDone("");
    try {
      const rows = await readMaterialFile(file);
      if (rows.length > 2001) throw new Error("Bitte maximal 2.000 Materialien pro Datei importieren.");
      setTable(rows); setIds(rows.map(() => crypto.randomUUID())); setExcluded([]);
      const map = { ...emptyMap };
      for (const key of Object.keys(fields) as Field[]) map[key] = (rows[0] || []).findIndex(v => aliases[key].test(v));
      setMapping(map);
    } catch (e) { setTable([]); setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function save() {
    const db = getSupabaseClient(); if (!db) return;
    setBusy(true); setError("");
    try {
      if (mapping.name < 0) throw new Error("Bitte die Spalte für den Materialnamen auswählen.");
      const selected = Object.values(mapping).filter(i => i >= 0);
      if (new Set(selected).size !== selected.length) throw new Error("Jede Spalte darf nur einem Feld zugeordnet werden.");
      const candidates = table.flatMap((row, i) => {
        if ((header && i === 0) || excluded.includes(i)) return [];
        const cell = (field: Field) => (row[mapping[field]] || "").trim();
        if (!cell("name")) throw new Error(`Zeile ${i + 1}: Materialname fehlt. Zeile korrigieren oder abwählen.`);
        const unit = cell("unit") || "Stk.";
        if (!/^[A-Za-zÄÖÜäöüßµ²³/% .-]{1,20}$/.test(unit)) throw new Error(`Zeile ${i + 1}: Ungültige Einheit.`);
        return [{ id: ids[i], company_id: companyId, name: cell("name"), sku: cell("sku") || null, unit,
          purchase_price: importNumber(cell("purchase_price"), decimal), sales_price: importNumber(cell("sales_price"), decimal),
          stock: importNumber(cell("stock"), decimal), min_stock: 0, active: true, trade_category: "Sonstiges", supplierName: cell("supplier") || supplier.trim() }];
      });
      if (!candidates.length) throw new Error("Keine Materialzeilen ausgewählt.");
      const sr = await readAllRows((from, to) => db.from("suppliers").select("id,name").eq("company_id", companyId).order("id").range(from, to));
      if (sr.error) throw sr.error;
      const existing = await readAllRows((from, to) => db.from("inventory_materials").select("id,sku,name,supplier_id").eq("company_id", companyId).order("id").range(from, to));
      if (existing.error) throw existing.error;
      const normal = (s: string) => s.trim().toLocaleLowerCase("de-DE");
      const suppliers = new Map((sr.data || []).map(s => [normal(s.name), s.id]));
      const names = [...new Set(candidates.map(c => c.supplierName).filter(Boolean))];
      for (const name of names) {
        if (suppliers.has(normal(name))) continue;
        const result = await db.from("suppliers").insert({ company_id: companyId, name, notes: `Materialimport ${batchId}` }).select("id").single();
        if (result.error) throw result.error;
        suppliers.set(normal(name), result.data.id);
      }
      const seen = new Set<string>(); let skipped = 0;
      const materials = candidates.flatMap(({ supplierName, ...c }) => {
        const supplier_id = suppliers.get(normal(supplierName)) || null;
        const key = c.sku ? `sku:${normal(c.sku)}` : `${normal(c.name)}:${supplier_id}`;
        if (seen.has(key) || existing.data?.some(e => e.id === c.id || (c.sku ? e.sku && normal(e.sku) === normal(c.sku) : normal(e.name) === normal(c.name) && e.supplier_id === supplier_id))) { skipped++; return []; }
        seen.add(key); return [{ ...c, supplier_id }];
      });
      if (materials.length) {
        const result = await db.from("inventory_materials").insert(materials);
        if (result.error) throw result.error;
      }
      setDone(`${materials.length} Materialien importiert. ${skipped} vorhandene oder doppelte Artikel übersprungen.`);
      setTable([]); onDone();
    } catch (e) { setError(e instanceof Error ? e.message : (e as { message?: string }).message || String(e)); }
    finally { setBusy(false); }
  }

  return <Modal title="Material aus PDF oder CSV importieren" onClose={() => !busy && onClose()}>
    <p>Spalten zuordnen und alle Zeilen prüfen. Preise werden unverändert übernommen; bestehende Artikel bleiben erhalten. Neue Händler werden angelegt.</p>
    <input aria-label="PDF oder CSV auswählen" type="file" accept=".csv,.tsv,.pdf" disabled={busy} onChange={e => void read(e.target.files?.[0])} />
    <p>PDF: nur auswählbarer Text. Bei uneinheitlichen Spalten bitte die Vorschau korrigieren oder CSV verwenden.</p>
    {error && <p className="loginError" role="alert">{error}</p>}{done && <p role="status">{done}</p>}
    {!!table.length && <>
      <div className="importMapping">
        <label><input type="checkbox" checked={header} onChange={e => setHeader(e.target.checked)} /> Erste Zeile ist Überschrift</label>
        <label>Zahlenformat<select value={decimal} onChange={e => setDecimal(e.target.value as "," | ".")}><option value=",">1.234,56</option><option value=".">1,234.56</option></select></label>
        <label>Händler, falls leer<input value={supplier} onChange={e => setSupplier(e.target.value)} /></label>
        {(Object.keys(fields) as Field[]).map(key => <label key={key}>{fields[key]}<select value={mapping[key]} onChange={e => setMapping({ ...mapping, [key]: Number(e.target.value) })}><option value={-1}>Nicht vorhanden</option>{Array.from({ length: columns }, (_, i) => <option value={i} key={i}>{i + 1}: {table[0]?.[i]?.slice(0, 35)}</option>)}</select></label>)}
      </div>
      <div className="importPreview"><table><thead><tr><th>Import</th>{Array.from({ length: columns }, (_, i) => <th key={i}>Spalte {i + 1}</th>)}</tr></thead><tbody>
        {table.map((row, i) => header && i === 0 ? null : <tr key={ids[i]}><td><input type="checkbox" aria-label={`Zeile ${i + 1} importieren`} checked={!excluded.includes(i)} onChange={e => setExcluded(e.target.checked ? excluded.filter(n => n !== i) : [...excluded, i])} /></td>{Array.from({ length: columns }, (_, j) => <td key={j}><input aria-label={`Zeile ${i + 1}, Spalte ${j + 1}`} value={row[j] || ""} onChange={e => setTable(table.map((r, n) => n !== i ? r : Array.from({ length: columns }, (_, k) => k === j ? e.target.value : r[k] || "")))} /></td>)}</tr>)}
      </tbody></table></div>
      <button className="primaryBtn" disabled={busy} onClick={() => void save()}>{busy ? "Import läuft…" : "Geprüfte Materialien importieren"}</button>
    </>}
  </Modal>;
}
