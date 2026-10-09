"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, EmptyState, LoadingState, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { deNumber, euro, formatCloudError, formatDate } from "@/lib/utils";
import type { Job } from "@/lib/types";

/** Lohnanteil am Verrechnungssatz — bestehendes Kalkulationsmodell (kein neuer Buchungssatz). */
const LABOR_SHARE = 0.48;

type TimeEntry = { job_id: string; started_at: string; ended_at: string | null };
type DocRow = {
  id: string;
  job_id: string | null;
  doc_type: "invoice" | "offer" | string;
  document_number: string | null;
  total_amount: number;
  status: string;
  issue_date?: string | null;
};
type MaterialLine = {
  id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

function hoursBetween(start: string, end: string | null) {
  const a = new Date(start).getTime();
  const b = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, (b - a) / 3600000);
}

function marginPct(revenue: number, costs: number) {
  if (!(revenue > 0)) return null;
  return ((revenue - costs) / revenue) * 100;
}

function marginTone(pct: number | null): "green" | "yellow" | "red" | "gray" {
  if (pct === null) return "gray";
  if (pct < 0) return "red";
  if (pct < 15) return "yellow";
  return "green";
}

type JobCalc = {
  job: Job;
  customerName: string;
  actualHours: number;
  planHours: number;
  material: number;
  laborActual: number;
  laborPlan: number;
  invoiceRevenue: number;
  offerValue: number;
  totalCost: number;
  contribution: number | null;
  margin: number | null;
  warnings: string[];
  invoices: DocRow[];
  offers: DocRow[];
};

export default function CostingPage() {
  const { jobs, customers, cloudLoading } = useAppData();
  const { company } = useCompany();
  const [times, setTimes] = useState<TimeEntry[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("Alle");
  const [customerId, setCustomerId] = useState("Alle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matLines, setMatLines] = useState<MaterialLine[]>([]);
  const [matLoading, setMatLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const s = getSupabaseClient();
      if (!s || !company) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      const [tr, dr] = await Promise.all([
        s
          .from("job_time_entries")
          .select("job_id,started_at,ended_at")
          .eq("company_id", company.id),
        s
          .from("documents")
          .select("id,job_id,doc_type,document_number,total_amount,status,issue_date")
          .eq("company_id", company.id)
          .in("doc_type", ["invoice", "offer"])
          .neq("status", "Storniert"),
      ]);
      const e = tr.error || dr.error;
      if (e) {
        setError(formatCloudError(e.message));
        setLoading(false);
        return;
      }
      setTimes((tr.data ?? []) as TimeEntry[]);
      setDocs((dr.data ?? []) as DocRow[]);
      setLoading(false);
    })();
  }, [company?.id, jobs.length]);

  useEffect(() => {
    if (!selectedId || !company) {
      setMatLines([]);
      return;
    }
    (async () => {
      const s = getSupabaseClient();
      if (!s) return;
      setMatLoading(true);
      const r = await s
        .from("job_materials")
        .select("id,material_name,quantity,unit,unit_price")
        .eq("job_id", selectedId)
        .eq("company_id", company.id)
        .order("created_at", { ascending: true });
      if (!r.error) setMatLines((r.data ?? []) as MaterialLine[]);
      else setMatLines([]);
      setMatLoading(false);
    })();
  }, [selectedId, company?.id]);

  const hoursByJob = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of times) m[t.job_id] = (m[t.job_id] ?? 0) + hoursBetween(t.started_at, t.ended_at);
    return m;
  }, [times]);

  const timesByJob = useMemo(() => {
    const m: Record<string, TimeEntry[]> = {};
    for (const t of times) {
      if (!m[t.job_id]) m[t.job_id] = [];
      m[t.job_id].push(t);
    }
    return m;
  }, [times]);

  const rate = Number(company?.hourly_rate ?? 0);

  const calcs = useMemo(() => {
    const list: JobCalc[] = jobs
      .filter((j) => j.status !== "Storniert")
      .map((j) => {
        const customerName = customers.find((c) => c.id === j.customerId)?.name ?? "—";
        const actualHours = hoursByJob[j.id] ?? 0;
        const planHours = Number(j.estimatedHours || 0);
        const material = Number(j.materialCost || 0);
        const laborActual = actualHours * rate * LABOR_SHARE;
        const laborPlan = planHours * rate * LABOR_SHARE;
        const invoices = docs.filter((d) => d.job_id === j.id && d.doc_type === "invoice");
        const offers = docs.filter((d) => d.job_id === j.id && d.doc_type === "offer");
        const invoiceRevenue = invoices.reduce((s, d) => s + Number(d.total_amount || 0), 0);
        const offerValue = offers.reduce((s, d) => s + Number(d.total_amount || 0), 0);
        const totalCost = material + laborActual;
        const contribution = invoiceRevenue > 0 ? invoiceRevenue - totalCost : null;
        const margin = marginPct(invoiceRevenue, totalCost);
        const warnings: string[] = [];
        const hasMaterialLines = material > 0;
        if (hasMaterialLines && invoiceRevenue <= 0) {
          warnings.push("Material gebucht, aber keine verknüpfte Rechnung");
        }
        if (invoiceRevenue > 0 && material <= 0 && laborActual <= 0) {
          warnings.push("Rechnung vorhanden, aber keine erfassten Kosten (Material/Ist-Zeit)");
        }
        if (invoiceRevenue > 0 && actualHours <= 0 && planHours > 0) {
          warnings.push("Keine Ist-Zeit — nur Planstunden hinterlegt");
        }
        if (margin !== null && margin < 0) {
          warnings.push("Negative Marge (Kosten über Umsatz)");
        }
        return {
          job: j,
          customerName,
          actualHours,
          planHours,
          material,
          laborActual,
          laborPlan,
          invoiceRevenue,
          offerValue,
          totalCost,
          contribution,
          margin,
          warnings,
          invoices,
          offers,
        };
      });
    return list;
  }, [jobs, customers, hoursByJob, docs, rate]);

  const filtered = useMemo(() => {
    let rows = calcs.filter((row) => {
      const j = row.job;
      if (status !== "Alle" && j.status !== status) return false;
      if (customerId !== "Alle" && j.customerId !== customerId) return false;
      if (dateFrom && j.date < dateFrom) return false;
      if (dateTo && j.date > dateTo) return false;
      return true;
    });
    // Worst margin first; jobs without revenue (null margin) after those with known margins, by date desc within group
    rows = [...rows].sort((a, b) => {
      const ma = a.margin;
      const mb = b.margin;
      if (ma === null && mb === null) return b.job.date.localeCompare(a.job.date);
      if (ma === null) return 1;
      if (mb === null) return -1;
      if (ma !== mb) return ma - mb;
      return b.job.date.localeCompare(a.job.date);
    });
    return rows;
  }, [calcs, status, customerId, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, r) => s + r.invoiceRevenue, 0);
    const material = filtered.reduce((s, r) => s + r.material, 0);
    const labor = filtered.reduce((s, r) => s + r.laborActual, 0);
    const contribution = revenue - material - labor;
    const margin = marginPct(revenue, material + labor);
    const warnCount = filtered.filter((r) => r.warnings.length > 0).length;
    return { revenue, material, labor, contribution, margin, warnCount };
  }, [filtered]);

  const selected = filtered.find((r) => r.job.id === selectedId) ?? calcs.find((r) => r.job.id === selectedId) ?? null;
  const busy = loading || cloudLoading;

  return (
    <main className="page">
      <PageHeader
        title="Nachkalkulation"
        subtitle="Auftragskosten: Umsatz (Rechnung) · Material · kalk. Lohn · Marge — aus echten Auftrags-, Zeit- und Belegdaten"
      />
      {error && <div className="loginError pageError">{error}</div>}

      <div className="statsGrid">
        <StatCard label="Umsatz (Rechnungen)" value={euro(totals.revenue)} hint="Verknüpfte Rechnungen, ohne Storniert" />
        <StatCard label="Materialkosten" value={euro(totals.material)} hint="Einkauf aus dem Auftragsmaterial" />
        <StatCard
          label="Kalk. Lohnkosten"
          value={euro(totals.labor)}
          hint={`Ist-Zeit × ${deNumber(rate, 2)} €/h × ${Math.round(LABOR_SHARE * 100)} % Lohnanteil`}
        />
        <StatCard
          label="Deckungsbeitrag"
          value={euro(totals.contribution)}
          hint={
            totals.margin === null
              ? "Kein Rechnungsumsatz im Filter"
              : `${deNumber(totals.margin, 1)} % Marge · ${totals.warnCount} Hinweis${totals.warnCount === 1 ? "" : "e"}`
          }
        />
      </div>

      {rate <= 0 && (
        <div className="taxNotice calcNotice" role="status">
          Kein Verrechnungssatz hinterlegt — Lohnkosten sind 0 €. Bitte unter Firmendaten den Satz €/h setzen.
        </div>
      )}

      <div className="toolbar calcToolbar">
        <div className="toolbarLeft">
          <label className="filterLabel">
            Von
            <input className="input" type="date" lang="de" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="filterLabel">
            Bis
            <input className="input" type="date" lang="de" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="Alle">Alle Status</option>
            <option value="Geplant">Geplant</option>
            <option value="In Arbeit">In Arbeit</option>
            <option value="Erledigt">Erledigt</option>
          </select>
          <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Kunde">
            <option value="Alle">Alle Kunden</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbarRight">
          <span className="cellSub">{filtered.length} Aufträge · Marge aufsteigend (schlecht zuerst)</span>
          {(dateFrom || dateTo || status !== "Alle" || customerId !== "Alle") && (
            <button
              type="button"
              className="ghostBtn smallBtn"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setStatus("Alle");
                setCustomerId("Alle");
              }}
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {totals.warnCount > 0 && (
        <div className="overdueBanner calcWarnBanner" role="status">
          <strong>Hinweise zur Kalkulation</strong>
          <span>
            {totals.warnCount} Auftrag{totals.warnCount === 1 ? "" : "e"} mit Hinweis, zum Beispiel Material ohne Rechnung oder eine Rechnung ohne Kosten. Die Einzelheiten stehen in der Zeile und unter Details.
          </span>
        </div>
      )}

      <div className="tableWrap">
        {busy ? (
          <LoadingState label="Nachkalkulation wird geladen…" />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="Noch keine Aufträge"
            hint="Lege Aufträge an, buche Material und Zeiten — dann erscheint hier die Nachkalkulation."
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="Keine Treffer" hint="Datums-, Status- oder Kundenfilter anpassen." />
        ) : (
          <table className="dataTable calcTable">
            <thead>
              <tr>
                <th>Auftrag</th>
                <th>Kunde</th>
                <th>Status</th>
                <th>Ist / Plan</th>
                <th>Material</th>
                <th>Kalk. Lohn</th>
                <th>Kosten</th>
                <th>Umsatz</th>
                <th>Marge</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const active = selectedId === row.job.id;
                return (
                  <tr
                    key={row.job.id}
                    className={`${row.warnings.length ? "rowCalcWarn" : ""} ${active ? "rowCalcActive" : ""}`}
                  >
                    <td>
                      <span className="cellTitle">{row.job.title}</span>
                      <span className="cellSub">
                        {row.job.number || "—"} · {formatDate(row.job.date)}
                      </span>
                      {row.warnings.length > 0 && (
                        <span className="calcWarnPill" title={row.warnings.join(" · ")}>
                          {row.warnings.length} Hinweis{row.warnings.length === 1 ? "" : "e"}
                        </span>
                      )}
                    </td>
                    <td>{row.customerName}</td>
                    <td>
                      <Badge
                        tone={
                          row.job.status === "Erledigt"
                            ? "green"
                            : row.job.status === "In Arbeit"
                              ? "orange"
                              : "blue"
                        }
                      >
                        {row.job.status}
                      </Badge>
                    </td>
                    <td>
                      {deNumber(row.actualHours, 2)} h
                      <span className="cellSub">Plan {deNumber(row.planHours, 1)} h</span>
                    </td>
                    <td className="money">{euro(row.material)}</td>
                    <td className="money">{euro(row.laborActual)}</td>
                    <td className="money">{euro(row.totalCost)}</td>
                    <td className="money">
                      {euro(row.invoiceRevenue)}
                      {row.offerValue > 0 && (
                        <span className="cellSub">Angebot {euro(row.offerValue)}</span>
                      )}
                    </td>
                    <td>
                      {row.margin === null ? (
                        <Badge tone="gray">—</Badge>
                      ) : (
                        <Badge tone={marginTone(row.margin)}>{deNumber(row.margin, 1)} %</Badge>
                      )}
                      {row.contribution !== null && (
                        <span className={`cellSub ${row.contribution < 0 ? "calcNeg" : ""}`}>
                          DB {euro(row.contribution)}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghostBtn smallBtn"
                        onClick={() => setSelectedId(active ? null : row.job.id)}
                      >
                        {active ? "Schließen" : "Details"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <section className="procurementDetail calcDetail" aria-label="Auftrags-Nachkalkulation">
          <div className="procurementHead">
            <div>
              <h3>
                {selected.job.number ? `${selected.job.number} · ` : ""}
                {selected.job.title}
              </h3>
              <span>
                {selected.customerName} · Termin {formatDate(selected.job.date)} · {selected.job.status}
              </span>
            </div>
            <button type="button" className="ghostBtn" onClick={() => setSelectedId(null)}>
              Schließen
            </button>
          </div>

          {selected.warnings.length > 0 && (
            <ul className="calcWarnList">
              {selected.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <div className="calcDetailGrid">
            <div className="calcDetailCard">
              <span>Rechnungsumsatz</span>
              <strong>{euro(selected.invoiceRevenue)}</strong>
              <small>
                {selected.invoices.length
                  ? selected.invoices.map((d) => d.document_number || "Rechnung").join(", ")
                  : "Keine verknüpfte Rechnung"}
              </small>
            </div>
            <div className="calcDetailCard">
              <span>Angebotswert</span>
              <strong>{euro(selected.offerValue)}</strong>
              <small>
                {selected.offers.length
                  ? selected.offers.map((d) => d.document_number || "Angebot").join(", ")
                  : "Kein verknüpftes Angebot — nur Info, kein Umsatz"}
              </small>
            </div>
            <div className="calcDetailCard">
              <span>Materialkosten (EK)</span>
              <strong>{euro(selected.material)}</strong>
              <small>Summe aus Auftragsmaterial (Einkaufspreis)</small>
            </div>
            <div className="calcDetailCard">
              <span>Kalk. Lohn (Ist)</span>
              <strong>{euro(selected.laborActual)}</strong>
              <small>
                {deNumber(selected.actualHours, 2)} h × {euro(rate)}/h × {Math.round(LABOR_SHARE * 100)} %
              </small>
            </div>
            <div className="calcDetailCard">
              <span>Kalk. Lohn (Plan)</span>
              <strong>{euro(selected.laborPlan)}</strong>
              <small>
                {deNumber(selected.planHours, 1)} h Plan × gleicher Satz — Vergleich, nicht in Ist-Kosten
              </small>
            </div>
            <div className="calcDetailCard">
              <span>Deckungsbeitrag / Marge</span>
              <strong className={selected.contribution !== null && selected.contribution < 0 ? "calcNeg" : ""}>
                {selected.contribution === null ? "—" : euro(selected.contribution)}
              </strong>
              <small>
                {selected.margin === null
                  ? "Marge erst mit Rechnungsumsatz berechenbar"
                  : `${deNumber(selected.margin, 1)} % vom Umsatz (Umsatz − Material − Ist-Lohn)`}
              </small>
            </div>
          </div>

          <div className="calcDetailCols">
            <div>
              <h4>Materialpositionen</h4>
              {matLoading ? (
                <LoadingState label="Material wird geladen…" />
              ) : matLines.length === 0 ? (
                <EmptyState title="Kein Material" hint="Am Auftrag wurden noch keine Materialpositionen gebucht." />
              ) : (
                <div className="tableWrap">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>Bezeichnung</th>
                        <th>Menge</th>
                        <th>EK</th>
                        <th>Summe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matLines.map((m) => {
                        const line = Number(m.quantity) * Number(m.unit_price);
                        return (
                          <tr key={m.id}>
                            <td>{m.material_name}</td>
                            <td>
                              {Number(m.quantity)} {m.unit}
                            </td>
                            <td className="money">{euro(Number(m.unit_price))}</td>
                            <td className="money">{euro(line)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <h4>Ist-Zeiten</h4>
              {(timesByJob[selected.job.id] ?? []).length === 0 ? (
                <EmptyState
                  title="Keine Zeiterfassung"
                  hint={
                    selected.planHours > 0
                      ? `Plan: ${deNumber(selected.planHours, 1)} h — Techniker-Zeiten erscheinen nach Start/Stop.`
                      : "Techniker-Zeiten erscheinen nach Start/Stop am Auftrag."
                  }
                />
              ) : (
                <div className="tableWrap">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>Start</th>
                        <th>Ende</th>
                        <th>Dauer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(timesByJob[selected.job.id] ?? []).map((t, i) => {
                        const h = hoursBetween(t.started_at, t.ended_at);
                        return (
                          <tr key={`${t.started_at}-${i}`}>
                            <td>{new Date(t.started_at).toLocaleString("de-DE")}</td>
                            <td>
                              {t.ended_at ? new Date(t.ended_at).toLocaleString("de-DE") : "läuft…"}
                            </td>
                            <td>{deNumber(h, 2)} h</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <p className="fieldHint calcModelHint">
            Modell: Umsatz = Summe verknüpfter Rechnungen (ohne Storniert). Kosten = Material-EK + Ist-Stunden ×
            Verrechnungssatz × {Math.round(LABOR_SHARE * 100)}&nbsp;% Lohnanteil. Angebotswert und Plan-Lohn dienen nur
            dem Vergleich — keine erfundenen Buchungen.
          </p>
        </section>
      )}
    </main>
  );
}
