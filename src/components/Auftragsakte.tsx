"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, LoadingState, Modal } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";
import type { Job, JobChecklistItem } from "@/lib/types";
import { formatCloudError, formatDate } from "@/lib/utils";
import { invoicePreviewHref, prepareInvoiceFromJob } from "@/lib/invoiceFromJob";
import { deliveryNotePreviewHref, prepareDeliveryNoteFromJob } from "@/lib/deliveryNoteFromJob";

type PhotoCategory = "vorher" | "nachher" | "sonst";
type TimeEntry = { id: string; employee_id: string | null; started_at: string; ended_at: string | null };
type JobMat = { id: string; material_name: string; quantity: number; unit: string; unit_price: number };
type PlannedMat = { id: string; description: string; quantity: number; unit: string; quoted_unit_price: number };
type JobPhoto = {
  id: string;
  storage_path: string;
  file_name: string | null;
  caption: string | null;
  category?: string | null;
  created_at: string;
  url?: string;
};

const DEFAULT_CHECKLIST: JobChecklistItem[] = [
  { id: "vorher", label: "Vorher-Foto aufgenommen", done: false },
  { id: "arbeit", label: "Arbeit / Prüfung erledigt", done: false },
  { id: "nachher", label: "Nachher-Foto aufgenommen", done: false },
  { id: "kunde", label: "Kunde informiert / Unterschrift", done: false },
];

function minutesBetween(start: string, end: string) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);
}
function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m} Min.`;
  return `${h} Std. ${m} Min.`;
}
function stamp(value: string) {
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}
function photoCat(p: JobPhoto): PhotoCategory {
  const c = (p.category || p.caption || "").toLowerCase();
  if (c === "vorher" || c === "nachher" || c === "sonst") return c;
  return "sonst";
}
function catLabel(c: PhotoCategory) {
  return c === "vorher" ? "Vorher" : c === "nachher" ? "Nachher" : "Sonstiges";
}
function normalizeChecklist(items?: JobChecklistItem[] | null): JobChecklistItem[] {
  if (items && items.length) {
    return items.map((i) => ({ id: String(i.id), label: String(i.label), done: !!i.done }));
  }
  return DEFAULT_CHECKLIST.map((i) => ({ ...i }));
}

export type AuftragsakteMeta = {
  deviceName?: string;
  deviceType?: string;
  errorCode?: string;
  errorTitle?: string;
};

type Props = {
  job: Job;
  meta?: AuftragsakteMeta;
  onClose: () => void;
  canPrepareInvoice?: boolean;
  canPrepareDeliveryNote?: boolean;
};

export default function Auftragsakte({ job, meta, onClose, canPrepareInvoice = false, canPrepareDeliveryNote = false }: Props) {
  const { customers, customerSites, employees } = useAppData();
  const { company } = useCompany();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const [invoiceErr, setInvoiceErr] = useState("");
  const [materials, setMaterials] = useState<JobMat[]>([]);
  const [plannedMaterials, setPlannedMaterials] = useState<PlannedMat[]>([]);
  const [dnBusy, setDnBusy] = useState(false);
  const [dnMsg, setDnMsg] = useState("");
  const [dnErr, setDnErr] = useState("");
  const [tick, setTick] = useState(0);

  const customer = customers.find((c) => c.id === job.customerId);
  const site = job.customerSiteId ? customerSites.find((s) => s.id === job.customerSiteId) : undefined;
  const employee = employees.find((e) => e.id === job.employeeId);
  const checklist = useMemo(() => normalizeChecklist(job.checklist), [job.checklist]);
  const checklistDone = checklist.filter((c) => c.done).length;

  const einsatzAddr = site
    ? [site.street, [site.postalCode, site.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : job.address || "";

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseClient();
      if (!supabase || !company) {
        setLoading(false);
        setError("Supabase / Firma nicht verfügbar.");
        return;
      }
      setLoading(true);
      setError("");
      const [t, p, m, pm] = await Promise.all([
        supabase.from("job_time_entries").select("id,employee_id,started_at,ended_at").eq("job_id", job.id).order("started_at", { ascending: false }),
        supabase.from("job_photos").select("*").eq("job_id", job.id).order("created_at", { ascending: false }),
        supabase.from("job_materials").select("id,material_name,quantity,unit,unit_price").eq("job_id", job.id).order("created_at", { ascending: true }),
        supabase.from("job_planned_materials").select("id,description,quantity,unit,quoted_unit_price").eq("job_id", job.id).order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (t.error || p.error || m.error || pm.error) {
        setError(formatCloudError((t.error || p.error || m.error || pm.error)!.message));
        setEntries([]);
        setPhotos([]);
        setMaterials([]);
        setPlannedMaterials([]);
        setLoading(false);
        return;
      }
      setEntries((t.data ?? []) as TimeEntry[]);
      setMaterials((m.data ?? []) as JobMat[]);
      setPlannedMaterials((pm.data ?? []) as PlannedMat[]);
      const rows = (p.data ?? []) as JobPhoto[];
      const withUrls = await Promise.all(
        rows.map(async (x) => {
          const { data } = await supabase.storage.from("job-files").createSignedUrl(x.storage_path, 3600);
          return { ...x, url: data?.signedUrl };
        })
      );
      if (cancelled) return;
      setPhotos(withUrls);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [job.id, company?.id]);

  const totalMinutes = useMemo(
    () => entries.reduce((sum, e) => sum + minutesBetween(e.started_at, e.ended_at ?? new Date().toISOString()), 0),
    [entries, tick]
  );

  const vorher = photos.filter((p) => photoCat(p) === "vorher");
  const nachher = photos.filter((p) => photoCat(p) === "nachher");
  const sonst = photos.filter((p) => photoCat(p) === "sonst");

  async function onPrepareInvoice() {
    if (!canPrepareInvoice || job.status !== "Erledigt") return;
    setInvoiceBusy(true);
    setInvoiceErr("");
    setInvoiceMsg("");
    try {
      const row = await prepareInvoiceFromJob(job.id);
      setInvoiceMsg(
        row.already_existed
          ? `Rechnung ${row.document_number} ist bereits vorhanden — öffne Vorschau.`
          : `Entwurf ${row.document_number} vorbereitet.`
      );
      router.push(invoicePreviewHref(row.id));
    } catch (err: unknown) {
      setInvoiceErr(formatCloudError(err instanceof Error ? err.message : String(err)));
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function onPrepareDeliveryNote() {
    if (!canPrepareDeliveryNote) return;
    setDnBusy(true);
    setDnErr("");
    setDnMsg("");
    try {
      const row = await prepareDeliveryNoteFromJob(job.id);
      setDnMsg(
        row.already_existed
          ? `Lieferschein ${row.document_number} ist bereits vorhanden — öffne Vorschau.`
          : row.material_count
            ? `Entwurf ${row.document_number} mit ${row.material_count} Materialposition(en) erstellt.`
            : `Entwurf ${row.document_number} erstellt — bitte Positionen prüfen.`
      );
      router.push(deliveryNotePreviewHref(row.id));
    } catch (err: unknown) {
      setDnErr(formatCloudError(err instanceof Error ? err.message : String(err)));
    } finally {
      setDnBusy(false);
    }
  }

  const materialSum = materials.reduce((s, x) => s + Number(x.quantity) * Number(x.unit_price || 0), 0);

  return (
    <Modal title="Auftragsakte" subtitle={`${job.number} · ${job.title}`} onClose={onClose}>
      <div className="akteRoot">
        <div className="akteHeadMeta">
          <Badge tone={job.status === "Erledigt" ? "green" : job.status === "In Arbeit" ? "orange" : job.status === "Storniert" ? "red" : "blue"}>
            {job.status}
          </Badge>
          <Badge tone={job.priority === "Notfall" ? "red" : job.priority === "Hoch" ? "yellow" : "gray"}>{job.priority}</Badge>
          <span className="cellSub">
            {formatDate(job.date)} · {job.time} Uhr
            {employee ? ` · ${employee.name}` : " · kein Techniker"}
          </span>
        </div>

        <section className="akteSection">
          <h3 className="akteSectionTitle">Kunde & Einsatzort</h3>
          <div className="akteGrid">
            <div>
              <span className="akteLabel">Kunde</span>
              <strong>{customer?.name ?? "—"}</strong>
              {customer?.phone ? <span className="cellSub">{customer.phone}</span> : null}
            </div>
            <div>
              <span className="akteLabel">Objekt / Einsatzort</span>
              <strong>{site?.name ?? "Kundenadresse"}</strong>
              {site?.tenantName ? <span className="cellSub">Mieter: {site.tenantName}{site.tenantPhone ? ` · ${site.tenantPhone}` : ""}</span> : null}
              <span className="cellSub">{einsatzAddr || "—"}</span>
            </div>
            <div>
              <span className="akteLabel">Gerät</span>
              <strong>{meta?.deviceName ?? (job.siteDeviceId ? "—" : "Kein Gerät")}</strong>
              {meta?.deviceType ? <span className="cellSub">{meta.deviceType}</span> : null}
            </div>
            <div>
              <span className="akteLabel">Fehlercode</span>
              <strong>{meta?.errorCode ?? (job.errorCodeId ? "—" : "Kein Code")}</strong>
              {meta?.errorTitle ? <span className="cellSub">{meta.errorTitle}</span> : null}
            </div>
          </div>
          {job.description ? <p className="akteDesc">{job.description}</p> : null}
        </section>

        {loading ? (
          <LoadingState label="Feld-Daten werden geladen…" />
        ) : (
          <>
            {error && <div className="loginError pageError">{error}</div>}

            <section className="akteSection">
              <div className="akteSectionHead">
                <h3 className="akteSectionTitle">Zeit</h3>
                <strong>{entries.length === 0 ? "0 Min." : fmtDuration(totalMinutes)}</strong>
              </div>
              {entries.length === 0 ? (
                <p className="akteEmpty">Noch keine Zeitbuchungen.</p>
              ) : (
                <ul className="akteTimeList">
                  {entries.map((e) => {
                    const mins = minutesBetween(e.started_at, e.ended_at ?? new Date().toISOString());
                    const who = employees.find((x) => x.id === e.employee_id)?.name;
                    return (
                      <li key={e.id}>
                        <div>
                          <strong>{stamp(e.started_at)}</strong>
                          <span className="cellSub">
                            → {e.ended_at ? stamp(e.ended_at) : "läuft…"}
                            {who ? ` · ${who}` : ""}
                          </span>
                        </div>
                        <span className="akteTimeDur">{fmtDuration(mins)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="akteSection">
              <div className="akteSectionHead">
                <h3 className="akteSectionTitle">Checkliste</h3>
                <strong>
                  {checklistDone}/{checklist.length}
                </strong>
              </div>
              <div className="techChecklist akteChecklist">
                {checklist.map((item) => (
                  <div key={item.id} className={`techCheckItem ${item.done ? "done" : ""}`} aria-disabled>
                    <span className={`akteCheckMark ${item.done ? "on" : ""}`} aria-hidden>
                      {item.done ? "✓" : "○"}
                    </span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {plannedMaterials.length > 0 ? (
              <section className="akteSection">
                <div className="akteSectionHead">
                  <h3 className="akteSectionTitle">Geplantes Material aus Angebot</h3>
                  <strong>{plannedMaterials.length} Pos.</strong>
                </div>
                <ul className="akteTimeList">
                  {plannedMaterials.map((m) => (
                    <li key={m.id}>
                      <div>
                        <strong>{m.description}</strong>
                        <span className="cellSub">{Number(m.quantity)} {m.unit || "Stk."} · Angebotspreis {Number(m.quoted_unit_price || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
                      </div>
                      <Badge tone="blue">Geplant</Badge>
                    </li>
                  ))}
                </ul>
                <p className="akteEmpty" style={{ marginTop: 8 }}>Noch keine Lagerbuchung: Bestand und Nachkalkulation ändern sich erst, wenn Material tatsächlich verwendet wird.</p>
              </section>
            ) : null}

            <section className="akteSection">
              <div className="akteSectionHead">
                <h3 className="akteSectionTitle">Material</h3>
                <strong>{materials.length === 0 ? "0 Pos." : `${materials.length} Pos.`}</strong>
              </div>
              {materials.length === 0 ? (
                <p className="akteEmpty">Noch kein Material am Auftrag — Lieferschein kann trotzdem als Entwurf angelegt werden.</p>
              ) : (
                <ul className="akteTimeList">
                  {materials.map((m) => (
                    <li key={m.id}>
                      <div>
                        <strong>{m.material_name}</strong>
                        <span className="cellSub">
                          {Number(m.quantity)} {m.unit || "Stk."}
                          {Number(m.unit_price) ? ` · ${Number(m.unit_price).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}` : ""}
                        </span>
                      </div>
                      <span className="akteTimeDur">
                        {(Number(m.quantity) * Number(m.unit_price || 0)).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {materials.length > 0 ? (
                <p className="akteEmpty" style={{ marginTop: 8 }}>
                  Summe Material (EK/Preis am Auftrag): {materialSum.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                </p>
              ) : null}
            </section>

            <section className="akteSection">
              <div className="akteSectionHead">
                <h3 className="akteSectionTitle">Fotos</h3>
                <span className="cellSub">
                  {vorher.length} vorher · {nachher.length} nachher · {sonst.length} sonst
                </span>
              </div>
              {photos.length === 0 ? (
                <p className="akteEmpty">Noch keine Fotos.</p>
              ) : (
                <div className="photoGrid aktePhotoGrid">
                  {photos.map((p) =>
                    p.url ? (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="photoGridItem">
                        <img src={p.url} alt={p.file_name ?? "Auftragsfoto"} />
                        <span className={`photoCatBadge photoCat-${photoCat(p)}`}>{catLabel(photoCat(p))}</span>
                      </a>
                    ) : null
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {invoiceErr && <div className="loginError pageError">{invoiceErr}</div>}
        {invoiceMsg && <div className="notice">{invoiceMsg}</div>}
        {dnErr && <div className="loginError pageError">{dnErr}</div>}
        {dnMsg && <div className="notice">{dnMsg}</div>}

        <div className="akteActions">
          <Link className="ghostBtn" href={`/techniker?job=${job.id}`}>
            Techniker-Ansicht
          </Link>
          {canPrepareDeliveryNote ? (
            <button type="button" className="ghostBtn" disabled={dnBusy} onClick={() => void onPrepareDeliveryNote()}>
              {dnBusy ? "Lieferschein wird erstellt…" : "Lieferschein erstellen"}
            </button>
          ) : null}
          {canPrepareInvoice && job.status === "Erledigt" ? (
            <button type="button" className="primaryBtn" disabled={invoiceBusy} onClick={() => void onPrepareInvoice()}>
              {invoiceBusy ? "Rechnung wird vorbereitet…" : "Rechnung vorbereiten"}
            </button>
          ) : canPrepareInvoice ? (
            <span className="cellSub">Rechnung vorbereiten erst bei Status „Erledigt“.</span>
          ) : null}
          <button type="button" className="ghostBtn" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </Modal>
  );
}
