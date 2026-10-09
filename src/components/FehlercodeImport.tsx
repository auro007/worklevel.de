"use client";

import { useState } from "react";
import { Modal } from "@/components/UI";
import { getSupabaseClient } from "@/lib/supabase";
import { readMaterialFile } from "@/lib/materialImport";
import { errorCodeFields, guessErrorCodeColumnsFromRows, type ErrorCodeField } from "@/lib/errorCodeImport";
import { readAllRows } from "@/lib/readAllRows";

const TRADES = ["Heizung", "Sanitär", "Lüftung", "Klima", "Sonstiges"] as const;
const emptyMap: Record<ErrorCodeField, number> = { code: -1, title: -1, description: -1 };

export default function FehlercodeImport({
  companyId,
  deviceNames,
  onClose,
  onDone,
}: {
  companyId: string;
  deviceNames: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState(emptyMap);
  const [header, setHeader] = useState(true);
  const [deviceName, setDeviceName] = useState("");
  const [trade, setTrade] = useState<(typeof TRADES)[number]>("Heizung");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [excluded, setExcluded] = useState<number[]>([]);
  const columns = Math.max(0, ...table.map((row) => row.length));

  async function read(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const rows = await readMaterialFile(file);
      if (rows.length > 2001) throw new Error("Bitte maximal 2.000 Fehlercodes pro Datei importieren.");
      const guessed = guessErrorCodeColumnsFromRows(rows);
      setTable(rows);
      setMapping(guessed.mapping);
      setHeader(guessed.header);
      setExcluded(rows.flatMap((row, index) => {
        if (guessed.header && index === 0) return [];
        const code = guessed.mapping.code < 0 ? "" : (row[guessed.mapping.code] || "").trim();
        return code ? [] : [index];
      }));
    } catch (e) {
      setTable([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const db = getSupabaseClient();
    if (!db) return;
    const appliance = deviceName.trim();
    if (appliance.length < 2 || appliance.length > 120) {
      setError("Bitte den Namen der Heizung oder des Geräts eingeben (2–120 Zeichen).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mapping.code < 0 || mapping.title < 0) throw new Error("Bitte die Spalten für Code und Titel auswählen.");
      const selected = [mapping.code, mapping.title, mapping.description].filter((index) => index >= 0);
      if (new Set(selected).size !== selected.length) throw new Error("Jede Spalte darf nur einem Feld zugeordnet werden.");
      const cell = (row: string[], field: ErrorCodeField) => (mapping[field] < 0 ? "" : (row[mapping[field]] || "").trim());
      const candidates = table.flatMap((row, index) => {
        if ((header && index === 0) || excluded.includes(index)) return [];
        const code = cell(row, "code").toUpperCase();
        const title = cell(row, "title");
        if (!code) return [];
        if (!title) throw new Error(`Zeile ${index + 1}: Titel fehlt. Zeile korrigieren oder abwählen.`);
        if (code.length > 40) throw new Error(`Zeile ${index + 1}: Code ist zu lang.`);
        return [{ code, title: title.slice(0, 200), description: cell(row, "description").slice(0, 2000) || null }];
      });
      if (!candidates.length) throw new Error("Keine Fehlercode-Zeilen ausgewählt.");
      const existing = await readAllRows((from, to) => db.from("error_codes").select("code,device_name").eq("company_id", companyId).order("id").range(from, to));
      if (existing.error) throw new Error(existing.error.message);
      const keyOf = (code: string, device: string | null) => `${code.trim().toLowerCase()}|${(device || "").trim().toLowerCase()}`;
      const seen = new Set((existing.data || []).map((row) => keyOf(row.code, row.device_name)));
      let skipped = 0;
      const fresh = candidates.filter((row) => {
        const key = keyOf(row.code, appliance);
        if (seen.has(key)) {
          skipped++;
          return false;
        }
        seen.add(key);
        return true;
      });
      for (let offset = 0; offset < fresh.length; offset += 200) {
        const chunk = fresh.slice(offset, offset + 200).map((row) => ({
          company_id: companyId,
          code: row.code,
          title: row.title,
          description: row.description,
          trade_category: trade,
          device_name: appliance,
          active: true,
        }));
        const result = await db.from("error_codes").insert(chunk);
        if (result.error) throw new Error(result.error.message);
      }
      setDone(`${fresh.length} Fehlercodes für „${appliance}“ importiert. ${skipped} vorhandene oder doppelte Codes übersprungen.`);
      setTable([]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Fehlercodes aus CSV oder PDF" subtitle="Die Datei wird ausgelesen. Alle Codes gehören zu dem Gerät, das du hier nennst." onClose={() => !busy && onClose()}>
      <div className="formGrid">
        <div className="formField wide">
          <label htmlFor="fehlercode-device">Name der Heizung oder des Geräts *</label>
          <input
            id="fehlercode-device"
            className="input"
            list="fehlercode-device-names"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="z. B. Vaillant ecoTEC plus"
            disabled={busy}
          />
          <datalist id="fehlercode-device-names">
            {deviceNames.map((name) => <option key={name} value={name} />)}
          </datalist>
        </div>
        <div className="formField">
          <label htmlFor="fehlercode-trade">Gewerk</label>
          <select id="fehlercode-trade" className="select" value={trade} disabled={busy} onChange={(e) => setTrade(e.target.value as (typeof TRADES)[number])}>
            {TRADES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>
      <div className="formField" style={{ marginTop: 14 }}>
        <label htmlFor="fehlercode-file">CSV oder PDF</label>
        <input id="fehlercode-file" aria-label="CSV oder PDF auswählen" type="file" accept=".csv,.tsv,.pdf,text/csv,application/pdf" disabled={busy} onChange={(e) => void read(e.target.files?.[0])} />
      </div>
      <p>PDF: nur auswählbarer Text. Spalten für Code und Titel werden erkannt und können korrigiert werden.</p>
      {error && <p className="loginError" role="alert">{error}</p>}
      {done && <p role="status">{done}</p>}
      {!!table.length && (
        <>
          <div className="importMapping">
            <label><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> Erste Zeile ist Überschrift</label>
            {(Object.keys(errorCodeFields) as ErrorCodeField[]).map((key) => (
              <label key={key}>
                {errorCodeFields[key]}
                <select value={mapping[key]} onChange={(e) => setMapping({ ...mapping, [key]: Number(e.target.value) })}>
                  <option value={-1}>{key === "description" ? "Nicht vorhanden" : "Bitte wählen"}</option>
                  {Array.from({ length: columns }, (_, index) => (
                    <option value={index} key={index}>{index + 1}: {table[0]?.[index]?.slice(0, 35)}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="importPreview">
            <table>
              <thead>
                <tr>
                  <th>Import</th>
                  {Array.from({ length: columns }, (_, index) => <th key={index}>Spalte {index + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {table.map((row, index) => header && index === 0 ? null : (
                  <tr key={index}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Zeile ${index + 1} importieren`}
                        checked={!excluded.includes(index)}
                        onChange={(e) => setExcluded(e.target.checked ? excluded.filter((n) => n !== index) : [...excluded, index])}
                      />
                    </td>
                    {Array.from({ length: columns }, (_, column) => (
                      <td key={column}>
                        <input
                          aria-label={`Zeile ${index + 1}, Spalte ${column + 1}`}
                          value={row[column] || ""}
                          onChange={(e) => setTable(table.map((current, rowIndex) => rowIndex !== index ? current : Array.from({ length: columns }, (_, cell) => cell === column ? e.target.value : current[cell] || "")))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="formActions">
            <button className="primaryBtn" disabled={busy} onClick={() => void save()}>{busy ? "Import läuft…" : `Für „${deviceName.trim() || "Gerät"}“ importieren`}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
