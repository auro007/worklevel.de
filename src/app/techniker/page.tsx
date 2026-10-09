"use client";

import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Badge, EmptyState, LoadingState, PageHeader } from "@/components/UI";
import PwaInstallHint from "@/components/PwaInstallHint";
import OfflineBanner from "@/components/OfflineBanner";
import { useAppData } from "@/context/AppDataProvider";
import { useAuth } from "@/context/AuthProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { compressImageFile } from "@/lib/compressImage";
import type { JobChecklistItem } from "@/lib/types";
import { formatCloudError, formatDate, initials } from "@/lib/utils";
import { readAllRows } from "@/lib/readAllRows";
import { invoicePreviewHref, prepareInvoiceFromJob } from "@/lib/invoiceFromJob";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

type TimeEntry = { id:string; employee_id:string|null; started_at:string; ended_at:string|null };
type JobMaterial = { id:string; inventory_material_id?:string|null; material_name:string; quantity:number; unit:string; unit_price:number; created_at:string };
type JobNote = { id:string; note:string; created_at:string };
type PhotoCategory = "vorher" | "nachher" | "sonst";
type JobPhoto = { id:string; storage_path:string; file_name:string|null; caption:string|null; category?:string|null; created_at:string; url?:string };
type JobSignature = { id:string; signer_name:string|null; storage_path:string; url?:string };
type CatalogMaterial = { id:string; sku:string|null; name:string; unit:string; stock:number };
type PlannedMaterial = { id:string; description:string; quantity:number; unit:string; quoted_unit_price:number; consumed_at:string|null; consumed_job_material_id:string|null };
type ErrorCodeOpt = { id:string; code:string; title:string; description:string|null; trade_category:string|null; device_name:string|null };
type SiteDeviceOpt = { id:string; name:string; device_type:string; serial_number:string|null; model:string|null; notes:string|null; plan_path:string|null; plan_url:string|null; customer_site_id:string|null; planSignedUrl?:string|null };

const DEFAULT_CHECKLIST: JobChecklistItem[] = [
  { id: "vorher", label: "Vorher-Foto aufgenommen", done: false },
  { id: "arbeit", label: "Arbeit / Prüfung erledigt", done: false },
  { id: "nachher", label: "Nachher-Foto aufgenommen", done: false },
  { id: "kunde", label: "Kunde informiert / Unterschrift", done: false },
];

function minutesBetween(start:string, end:string) { return Math.max(0, (new Date(end).getTime()-new Date(start).getTime())/60000); }
function fmtDuration(minutes:number) {
  const h = Math.floor(minutes/60);
  const m = Math.round(minutes%60);
  if (h <= 0) return `${m} Min.`;
  return `${h} Std. ${m} Min.`;
}
function fmtHoursShort(minutes:number) {
  const h = minutes / 60;
  if (h < 0.05) return "0 h";
  return `${h.toFixed(1).replace(".", ",")} h`;
}
function stamp(value:string) { return new Date(value).toLocaleString("de-DE", { dateStyle:"short", timeStyle:"short" }); }
function todayIso() { return new Date().toLocaleDateString("en-CA"); }
function mapsUrl(address:string) {
  const q = address.trim();
  if (!q) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
function photoCat(p: JobPhoto): PhotoCategory {
  const c = (p.category || p.caption || "").toLowerCase();
  if (c === "vorher" || c === "nachher" || c === "sonst") return c;
  return "sonst";
}
function normalizeChecklist(items?: JobChecklistItem[] | null): JobChecklistItem[] {
  if (items && items.length) {
    return items.map(i => ({ id: String(i.id), label: String(i.label), done: !!i.done }));
  }
  return DEFAULT_CHECKLIST.map(i => ({ ...i }));
}

export default function TechnicianPage() {
  const { user } = useAuth();
  const { company, role } = useCompany();
  const { jobs, customers, customerSites, employees, updateJob, reloadCloud, cloudError, cloudLoading } = useAppData();
  const router = useRouter();
  const online = useOnlineStatus();
  function requireOnline(): boolean {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("Offline — Speichern erst wieder möglich, wenn Netz da ist.");
      return false;
    }
    return true;
  }
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceInfo, setInvoiceInfo] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [jobId, setJobId] = useState("");
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [travelEntries, setTravelEntries] = useState<TimeEntry[]>([]);
  const [materials, setMaterials] = useState<JobMaterial[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [signature, setSignature] = useState<JobSignature|null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoStatus, setPhotoStatus] = useState("");
  const [photoCategory, setPhotoCategory] = useState<PhotoCategory>("vorher");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [note, setNote] = useState("");
  const [material, setMaterial] = useState({ name:"", quantity:"1", unit:"Stk.", price:"0" });
  const [catalog,setCatalog]=useState<CatalogMaterial[]>([]); const [catalogId,setCatalogId]=useState("");
  const [plannedMaterials,setPlannedMaterials]=useState<PlannedMaterial[]>([]);
  const [plannedCatalog,setPlannedCatalog]=useState<Record<string,string>>({});
  const [errorCodes, setErrorCodes] = useState<ErrorCodeOpt[]>([]);
  const [codeQuery, setCodeQuery] = useState("");
  const [siteDevices, setSiteDevices] = useState<SiteDeviceOpt[]>([]);
  const [attachingCode, setAttachingCode] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [todayMinutesByJob, setTodayMinutesByJob] = useState<Record<string, number>>({});
  const [weekMinutes, setWeekMinutes] = useState(0);
  const [checklist, setChecklist] = useState<JobChecklistItem[]>(DEFAULT_CHECKLIST);
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const drawing = useRef(false);
  const photoSectionRef = useRef<HTMLElement|null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("job");
    if (id) setJobId(id);
  }, []);

  useEffect(() => {
    if (role === "worker" && user) {
      const mine = employees.find(e => e.authUserId === user.id);
      if (mine && employeeId !== mine.id) setEmployeeId(mine.id);
      return;
    }
    if (!employeeId && employees.length) setEmployeeId(employees[0].id);
  }, [employees, employeeId, role, user?.id]);
  useEffect(() => { const timer=setInterval(()=>setTick((x)=>x+1), 30000); return ()=>clearInterval(timer); }, []);

  const visibleJobs = useMemo(() => employeeId ? jobs.filter(j => j.employeeId===employeeId) : jobs, [jobs, employeeId]);
  const today = todayIso();
  const todayJobs = useMemo(
    () => visibleJobs.filter(j => j.date === today && !["Storniert"].includes(j.status)).sort((a,b) => (a.time||"").localeCompare(b.time||"")),
    [visibleJobs, today]
  );
  const openJobs = useMemo(
    () => visibleJobs.filter(j => !["Erledigt","Storniert"].includes(j.status)).sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time)),
    [visibleJobs]
  );
  const job = jobs.find(j=>j.id===jobId);
  const customer = customers.find(c=>c.id===job?.customerId);
  const site = job?.customerSiteId ? customerSites.find(s=>s.id===job.customerSiteId) : undefined;
  const employee = employees.find(e=>e.id===job?.employeeId);
  const einsatzAddr = site
    ? [site.street, [site.postalCode, site.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : (job?.address || "");
  const rechnungAddr = customer
    ? [customer.street, [customer.postalCode, customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  const navAddr = einsatzAddr || job?.address || "";
  const navLink = mapsUrl(navAddr);
  const running = entries.find(e=>!e.ended_at) ?? null;
  const travelling = travelEntries.find(e => !e.ended_at) ?? null;
  const travelStatusText = useMemo(() => {
    if (!travelEntries.length) return "";
    const openCapMin = 8 * 60;
    let closed = 0;
    let open: TimeEntry | null = null;
    for (const entry of travelEntries) {
      if (!entry.ended_at) open = entry;
      else closed += minutesBetween(entry.started_at, entry.ended_at);
    }
    if (open) {
      const openMins = minutesBetween(open.started_at, new Date().toISOString());
      if (openMins > openCapMin) {
        const recorded = closed > 0 ? `Erfasste Fahrzeit: ${fmtDuration(closed)}. ` : "";
        return `${recorded}Fahrt seit ${stamp(open.started_at)} nicht beendet — bei Ankunft „Angekommen“ drücken`;
      }
      return `Fahrzeit: ${fmtDuration(closed + openMins)} · Fahrt läuft — bei Ankunft „Angekommen“ drücken`;
    }
    return `Fahrzeit: ${fmtDuration(closed)} · beendet`;
  }, [travelEntries, tick]);
  const actualMinutes = useMemo(() => entries.reduce((sum,e)=>sum+minutesBetween(e.started_at,e.ended_at ?? new Date().toISOString()),0), [entries,tick]);
  const materialTotal = useMemo(() => materials.reduce((sum,m)=>sum+Number(m.quantity)*Number(m.unit_price),0), [materials]);
  const isWorker = role === "worker";
  const vorherPhotos = useMemo(() => photos.filter(p => photoCat(p) === "vorher"), [photos]);
  const nachherPhotos = useMemo(() => photos.filter(p => photoCat(p) === "nachher"), [photos]);
  const checklistDone = checklist.filter(c => c.id === "vorher" ? vorherPhotos.length > 0 : c.id === "nachher" ? nachherPhotos.length > 0 : c.done).length;

  useEffect(() => {
    const ids = [...new Set([...todayJobs, ...openJobs.slice(0, 12)].map(j => j.id))];
    if (!ids.length || !user) { setTodayMinutesByJob({}); return; }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const dayStart = `${today}T00:00:00`;
      const { data, error: e } = await supabase
        .from("job_time_entries")
        .select("job_id,started_at,ended_at")
        .in("job_id", ids)
        .gte("started_at", new Date(dayStart).toISOString());
      if (cancelled) return;
      if (e) return;
      const map: Record<string, number> = {};
      const nowIso = new Date().toISOString();
      for (const row of data ?? []) {
        const jid = String((row as {job_id:string}).job_id);
        const mins = minutesBetween((row as {started_at:string}).started_at, (row as {ended_at:string|null}).ended_at ?? nowIso);
        map[jid] = (map[jid] || 0) + mins;
      }
      setTodayMinutesByJob(map);
    })();
    return () => { cancelled = true; };
  }, [todayJobs, openJobs, user?.id, today, tick, jobId]);

  useEffect(() => {
    if (job) setChecklist(normalizeChecklist(job.checklist));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when job or its checklist reference changes
  }, [job?.id, job?.checklist]);


  // V14.2 — worker/tech summary: hours this week for selected employee
  useEffect(() => {
    if (!employeeId || !user || !company) { setWeekMinutes(0); return; }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error: e } = await supabase
        .from("job_time_entries")
        .select("started_at,ended_at")
        .eq("company_id", company.id)
        .eq("employee_id", employeeId)
        .gte("started_at", weekAgo);
      if (cancelled || e) return;
      const nowIso = new Date().toISOString();
      let mins = 0;
      for (const row of data ?? []) {
        mins += minutesBetween((row as {started_at:string}).started_at, (row as {ended_at:string|null}).ended_at ?? nowIso);
      }
      setWeekMinutes(mins);
    })();
    return () => { cancelled = true; };
  }, [employeeId, user?.id, company?.id, tick, jobId]);

  async function loadDetails(id:string) {
    if (!id) { setEntries([]); setTravelEntries([]); setMaterials([]); setNotes([]); setPhotos([]); setSignature(null); setPlannedMaterials([]); setDetailsLoading(false); return; }
    const supabase=getSupabaseClient(); if (!supabase || !user) return;
    setError("");
    setDetailsLoading(true);
    const [t,m,n,p,s,pm] = await Promise.all([
      supabase.from("job_time_entries").select("*").eq("job_id",id).order("started_at",{ascending:false}),
      supabase.from("job_materials").select("*").eq("job_id",id).order("created_at",{ascending:false}),
      supabase.from("job_notes").select("*").eq("job_id",id).order("created_at",{ascending:false}),
      supabase.from("job_photos").select("*").eq("job_id",id).order("created_at",{ascending:false}),
      supabase.from("job_signatures").select("*").eq("job_id",id).maybeSingle(),
      supabase.from("job_planned_materials").select("id,description,quantity,unit,quoted_unit_price,consumed_at,consumed_job_material_id").eq("job_id",id).order("created_at",{ascending:true}),
    ]);
    const e=t.error||m.error||n.error||p.error||s.error||pm.error;
    if (e) { setError(`${e.message} — Prüfe, ob SETUP-WORKLEVEL-V6.sql in Supabase erfolgreich ausgeführt wurde.`); setDetailsLoading(false); return; }
    setEntries((t.data??[]) as TimeEntry[]); setMaterials((m.data??[]) as JobMaterial[]); setNotes((n.data??[]) as JobNote[]); setPlannedMaterials((pm.data??[]) as PlannedMaterial[]);
    const travel = await supabase.from("job_travel_entries").select("id,employee_id,started_at,ended_at").eq("job_id", id).order("started_at", { ascending: false });
    setTravelEntries((travel.data || []) as TimeEntry[]);
    if (travel.error) setError("Fahrzeiterfassung konnte nicht geladen werden. Bitte erneut versuchen oder die Firmenverwaltung kontaktieren.");
    const pp=(p.data??[]) as JobPhoto[];
    const withUrls=await Promise.all(pp.map(async x=>{ const {data}=await supabase.storage.from("job-files").createSignedUrl(x.storage_path,3600); return {...x,url:data?.signedUrl}; }));
    setPhotos(withUrls);
    if (s.data) { const sig=s.data as JobSignature; const {data}=await supabase.storage.from("job-files").createSignedUrl(sig.storage_path,3600); setSignature({...sig,url:data?.signedUrl}); } else setSignature(null);
    setDetailsLoading(false);
  }

  useEffect(()=>{ void loadDetails(jobId); },[jobId,user?.id]);
  useEffect(()=>{(async()=>{const s=getSupabaseClient();if(!s||!company)return;const r=await s.rpc("worker_inventory_catalog");if(!r.error)setCatalog((r.data??[]) as CatalogMaterial[])})()},[company?.id,user?.id]);

  // V14.3 — Fehlercodes katalog (read-only lookup)
  useEffect(() => {
    const s = getSupabaseClient();
    if (!s || !company) { setErrorCodes([]); return; }
    let cancelled = false;
    (async () => {
      const r = await readAllRows((from, to) => s.from("error_codes").select("id,code,title,description,trade_category,device_name").eq("company_id", company.id).eq("active", true).order("code").order("id").range(from, to));
      if (cancelled) return;
      if (!r.error) setErrorCodes((r.data ?? []) as ErrorCodeOpt[]);
    })();
    return () => { cancelled = true; };
  }, [company?.id, user?.id]);

  // V14.3 — Geräte am Kunden / Objekt des aktuellen Auftrags
  useEffect(() => {
    const s = getSupabaseClient();
    if (!s || !company || !job?.customerId) { setSiteDevices([]); return; }
    let cancelled = false;
    (async () => {
      let q = s.from("site_devices").select("id,name,device_type,serial_number,model,notes,plan_path,plan_url,customer_site_id").eq("company_id", company.id).eq("customer_id", Number(job.customerId)).eq("active", true).order("name");
      const r = await q;
      if (cancelled) return;
      if (r.error) { setSiteDevices([]); return; }
      let list = (r.data ?? []) as SiteDeviceOpt[];
      // Prefer devices for the job site, but still show customer-wide
      if (job.customerSiteId) {
        const siteOnes = list.filter(d => !d.customer_site_id || d.customer_site_id === job.customerSiteId);
        if (siteOnes.length) list = siteOnes;
      }
      const withPlans = await Promise.all(list.map(async d => {
        if (!d.plan_path) return { ...d, planSignedUrl: null };
        const { data } = await s.storage.from("device-plans").createSignedUrl(d.plan_path, 3600);
        return { ...d, planSignedUrl: data?.signedUrl ?? null };
      }));
      setSiteDevices(withPlans);
    })();
    return () => { cancelled = true; };
  }, [company?.id, user?.id, job?.id, job?.customerId, job?.customerSiteId]);

  async function persistChecklist(next: JobChecklistItem[]) {
    if (!job) return;
    if (!requireOnline()) return;
    setChecklist(next);
    const ok = await updateJob(job.id, { checklist: next });
    if (!ok) setError("Checkliste konnte nicht gespeichert werden.");
  }

  async function toggleChecklist(id: string) {
    const next = checklist.map(c => c.id === id ? { ...c, done: !c.done } : c);
    await persistChecklist(next);
  }

  async function markChecklistDone(id: string) {
    if (checklist.find(c => c.id === id)?.done) return;
    const next = checklist.map(c => c.id === id ? { ...c, done: true } : c);
    await persistChecklist(next);
  }


  const filteredCodes = useMemo(() => {
    const q = codeQuery.trim().toLowerCase();
    if (!q) return errorCodes.slice(0, 40);
    return errorCodes.filter(c => `${c.code} ${c.title} ${c.description ?? ""} ${c.trade_category ?? ""} ${c.device_name ?? ""}`.toLowerCase().includes(q)).slice(0, 40);
  }, [errorCodes, codeQuery]);

  const attachedCode = useMemo(
    () => (job?.errorCodeId ? errorCodes.find(c => c.id === job.errorCodeId) : undefined),
    [job?.errorCodeId, errorCodes]
  );
  const attachedDevice = useMemo(
    () => (job?.siteDeviceId ? siteDevices.find(d => d.id === job.siteDeviceId) : undefined),
    [job?.siteDeviceId, siteDevices]
  );

  async function attachErrorCode(codeId: string | null) {
    if (!job) return;
    if (!requireOnline()) return;
    setAttachingCode(true);
    setError("");
    const ok = await updateJob(job.id, { errorCodeId: codeId || undefined });
    if (!ok) setError("Fehlercode konnte nicht gespeichert werden.");
    else await reloadCloud();
    setAttachingCode(false);
  }

  async function arriveAndStart() {
    if (!job || !user || running) return;
    if (!requireOnline()) return;
    const supabase=getSupabaseClient(); if(!supabase)return;
    setBusy(true); setError("");
    const {error:e}=await supabase.rpc("transition_job_timer", { p_job: job.id, p_action: "work" });
    if(e) setError(e.message);
    else {
      await loadDetails(job.id);
      await reloadCloud();
    }
    setBusy(false);
  }

  async function startWork() { await arriveAndStart(); }

  async function startTravel() {
    if (!job || !navLink || busy || !requireOnline()) return;
    const db = getSupabaseClient(); if (!db) return;
    setBusy(true); setError("");
    try {
      const result = await db.rpc("transition_job_timer", { p_job: job.id, p_action: "travel" });
      if (result.error) throw result.error;
      await loadDetails(job.id);
      window.location.assign(navLink);
    } catch (e) { setError((e as { message?: string }).message || "Fahrt konnte nicht gestartet werden."); }
    finally { setBusy(false); }
  }

  async function pauseWork() {
    if(!running)return; if(!requireOnline())return; const supabase=getSupabaseClient(); if(!supabase)return; setBusy(true);
    const {error:e}=await supabase.from("job_time_entries").update({ended_at:new Date().toISOString()}).eq("id",running.id);
    if(e)setError(e.message); else await loadDetails(jobId); setBusy(false);
  }

  async function prepareInvoice() {
    if (!job || role === "worker") return;
    if (!requireOnline()) return;
    setInvoiceBusy(true);
    setInvoiceInfo("");
    setError("");
    try {
      const row = await prepareInvoiceFromJob(job.id);
      setInvoiceInfo(
        row.already_existed
          ? `Rechnung ${row.document_number} bereits vorhanden.`
          : `Entwurf ${row.document_number} vorbereitet.`
      );
      router.push(invoicePreviewHref(row.id));
    } catch (err: unknown) {
      setError(formatCloudError(err instanceof Error ? err.message : String(err)));
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function finishWork() {
    if(!job)return;
    if (!requireOnline()) return;
    if (vorherPhotos.length === 0) {
      setError("Bitte zuerst ein Vorher-Foto aufnehmen.");
      setPhotoCategory("vorher");
      photoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (nachherPhotos.length === 0) {
      setError("Bitte zuerst ein Nachher-Foto aufnehmen.");
      setPhotoCategory("nachher");
      photoSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const openItems = checklist.filter(c => !["vorher","nachher"].includes(c.id) && !c.done);
    if (openItems.length > 0) {
      setError(`Checkliste unvollständig. Offen: ${openItems.map(i=>i.label).join(", ")}`);
      return;
    }
    const supabase=getSupabaseClient(); if(!supabase)return; setBusy(true); setError("");
    if(running) { const {error:e}=await supabase.from("job_time_entries").update({ended_at:new Date().toISOString()}).eq("id",running.id); if(e){setError(e.message);setBusy(false);return;} }
    const ok=await updateJob(job.id,{status:"Erledigt"}); if(ok){await reloadCloud();await loadDetails(job.id);} setBusy(false);
  }

  async function addNote(e:FormEvent) { e.preventDefault(); if(!note.trim()||!job||!user)return; if(!requireOnline())return; const supabase=getSupabaseClient(); if(!supabase)return; setBusy(true);
    const {error:e2}=await supabase.from("job_notes").insert({owner_id:user.id,company_id:company?.id,job_id:job.id,note:note.trim()}); if(e2)setError(e2.message); else {setNote("");await loadDetails(job.id);} setBusy(false);
  }
  async function addMaterial(e:FormEvent) { e.preventDefault(); if(!job||!user)return; if(!requireOnline())return; const supabase=getSupabaseClient(); if(!supabase)return; setBusy(true); setError("");
    let result:{error?:{message:string}|null}|null = null;
    if(catalogId) result=await supabase.rpc("add_catalog_material_to_job",{p_job:job.id,p_material:catalogId,p_quantity:Number(material.quantity)||1});
    else if(material.name.trim()) result=isWorker ? await supabase.rpc("worker_add_job_material",{p_job:job.id,p_name:material.name.trim(),p_quantity:Number(material.quantity)||1,p_unit:material.unit||"Stk."}) : await supabase.from("job_materials").insert({owner_id:user.id,company_id:company?.id,job_id:job.id,material_name:material.name.trim(),quantity:Number(material.quantity)||1,unit:material.unit||"Stk.",unit_price:Number(material.price)||0});
    else {setError("Bitte Material auswählen oder Namen eingeben.");setBusy(false);return;}
    if(result?.error)setError(result.error.message); else {setCatalogId("");setMaterial({name:"",quantity:"1",unit:"Stk.",price:"0"});const r=await supabase.rpc("worker_inventory_catalog");if(!r.error)setCatalog((r.data??[]) as CatalogMaterial[]);await loadDetails(job.id);} setBusy(false);
  }
  async function consumePlannedMaterial(p: PlannedMaterial) {
    if (!job || p.consumed_at) return;
    if (!requireOnline()) return;
    const materialId = plannedCatalog[p.id];
    if (!materialId) { setError("Bitte zuerst das passende Lagermaterial auswählen."); return; }
    const supabase=getSupabaseClient(); if(!supabase)return;
    setBusy(true); setError("");
    const r=await supabase.rpc("consume_planned_job_material",{p_planned:p.id,p_material:materialId});
    if(r.error)setError(formatCloudError(r.error.message)); else {
      const c=await supabase.rpc("worker_inventory_catalog"); if(!c.error)setCatalog((c.data??[]) as CatalogMaterial[]);
      await loadDetails(job.id); await reloadCloud();
    }
    setBusy(false);
  }

  async function removeMaterial(id:string) {
    if(!job)return; if(!requireOnline())return; if(!confirm("Materialposition entfernen? Katalogmaterial wird wieder ins Lager zurückgebucht."))return;
    const supabase=getSupabaseClient();if(!supabase)return;setBusy(true);setError("");
    const r=await supabase.rpc("remove_job_material",{p_job_material:id});
    if(r.error)setError(r.error.message); else {const c=await supabase.rpc("worker_inventory_catalog");if(!c.error)setCatalog((c.data??[]) as CatalogMaterial[]);await loadDetails(job.id);await reloadCloud();}
    setBusy(false);
  }

  async function uploadPhoto(file:File|null, category: PhotoCategory = photoCategory) {
    if(!file||!job||!user)return;
    if (!requireOnline()) return;
    const supabase=getSupabaseClient();
    if(!supabase)return;
    if(!company){ setError(formatCloudError("Kein Firmenkontext.")); return; }
    setBusy(true);
    setError("");
    setPhotoStatus("Foto wird komprimiert…");
    try {
      const compressed = await compressImageFile(file, { maxEdge: 1600, quality: 0.72 });
      const safe = compressed.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${company.id}/${job.id}/photos/${Date.now()}-${safe}`;
      setPhotoStatus("Foto wird hochgeladen…");
      const up = await supabase.storage.from("job-files").upload(path, compressed.blob, {
        contentType: compressed.blob.type || "image/jpeg",
        upsert: false,
      });
      if (up.error) {
        setError(formatCloudError(up.error.message));
      } else {
        const row: Record<string, unknown> = {
          owner_id: user.id,
          company_id: company.id,
          job_id: job.id,
          storage_path: path,
          file_name: compressed.fileName,
          caption: category,
          category,
        };
        let ins = await supabase.from("job_photos").insert(row);
        if (ins.error && /category/i.test(ins.error.message)) {
          delete row.category;
          ins = await supabase.from("job_photos").insert(row);
        }
        if (ins.error) setError(formatCloudError(ins.error.message));
        else {
          await loadDetails(job.id);
          if (category === "vorher") await markChecklistDone("vorher");
          if (category === "nachher") await markChecklistDone("nachher");
          if (category === "vorher") setPhotoCategory("nachher");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(formatCloudError(msg));
    } finally {
      setPhotoStatus("");
      setBusy(false);
    }
  }

  function canvasPoint(e:PointerEvent<HTMLCanvasElement>) { const c=canvasRef.current!; const r=c.getBoundingClientRect(); return {x:(e.clientX-r.left)*(c.width/r.width),y:(e.clientY-r.top)*(c.height/r.height)}; }
  function beginDraw(e:PointerEvent<HTMLCanvasElement>) { const c=canvasRef.current;if(!c)return; drawing.current=true;c.setPointerCapture(e.pointerId);const p=canvasPoint(e);const ctx=c.getContext("2d")!;ctx.beginPath();ctx.moveTo(p.x,p.y); }
  function draw(e:PointerEvent<HTMLCanvasElement>) { if(!drawing.current)return;const c=canvasRef.current;if(!c)return;const p=canvasPoint(e);const ctx=c.getContext("2d")!;ctx.strokeStyle="#111";ctx.lineWidth=3;ctx.lineCap="round";ctx.lineJoin="round";ctx.lineTo(p.x,p.y);ctx.stroke(); }
  function endDraw(){drawing.current=false;}
  function clearSignature(){const c=canvasRef.current;if(c)c.getContext("2d")?.clearRect(0,0,c.width,c.height);}
  async function saveSignature(){const c=canvasRef.current;if(!c||!job||!user)return; if(!requireOnline())return;const supabase=getSupabaseClient();if(!supabase)return;setBusy(true);setError("");
    const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,"image/png")); if(!blob){setBusy(false);return;}
    if(!company){setBusy(false);return;} const path=`${company.id}/${job.id}/signature/signature.png`; const up=await supabase.storage.from("job-files").upload(path,blob,{contentType:"image/png",upsert:true});
    if(up.error)setError(formatCloudError(up.error.message)); else { const res=await supabase.from("job_signatures").upsert({owner_id:user.id,company_id:company.id,job_id:job.id,signer_name:signerName||null,storage_path:path},{onConflict:"job_id"}); if(res.error)setError(formatCloudError(res.error.message)); else {clearSignature();await loadDetails(job.id);await markChecklistDone("kunde");} }
    setBusy(false);
  }

  function openJob(id: string) {
    setJobId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("job", id);
    window.history.replaceState({}, "", url.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearJob() {
    setJobId("");
    const url = new URL(window.location.href);
    url.searchParams.delete("job");
    window.history.replaceState({}, "", url.pathname);
  }

  const statusTone = (s: string) => s==="Erledigt"?"green":s==="In Arbeit"?"orange":"blue";
  const prioTone = (p: string) => p==="Notfall"?"red":p==="Hoch"?"yellow":"gray";
  const catLabel = (c: PhotoCategory) => c==="vorher"?"Vorher":c==="nachher"?"Nachher":"Sonstiges";

  const todayBookedOnJob = todayMinutesByJob[job?.id || ""]
    || entries.filter(e => e.started_at.slice(0,10) === today).reduce((s,e)=>s+minutesBetween(e.started_at,e.ended_at??new Date().toISOString()),0);

  return <main className={`page technicianPage ${job ? "hasActiveJob" : ""}`}>
    <PageHeader
      title={isWorker ? "Meine Aufträge" : "Techniker"}
      subtitle={isWorker ? "Ankunft → Zeit → Fotos vorher → Checkliste → Fertig" : "Mobiler Arbeitsablauf: Ankunft, Zeit, Fotos, Checkliste, Material, Unterschrift"}
      action={job ? <button type="button" className="ghostBtn techBackBtn" onClick={clearJob}>← Übersicht</button> : undefined}
    />
    <PwaInstallHint />
    <OfflineBanner />
    {!online && <div className="offlineReadOnlyHint" role="note">Nur Lesen — Schreibaktionen sind offline gesperrt.</div>}
    <div className="cloudNotice"><span className="cloudDot"/>Arbeitsdokumentation wird im geschützten Firmenbereich gespeichert.</div>
    {(error||cloudError)&&<div className="loginError pageError">{error||cloudError}</div>}

    {!job && (
      <>
        {(() => {
          const me = employees.find(e => e.id === employeeId);
          if (!me && !isWorker) return null;
          const show = me || (isWorker ? employees.find(e => e.authUserId === user?.id) : null);
          if (!show) return null;
          return (
            <div className="techProfileStrip" aria-label="Mitarbeiter-Kurzprofil">
              <div className="techProfileStripWho">
                <div className="avatar">{initials(show.name)}</div>
                <div>
                  <strong>{show.name}</strong>
                  <span>{show.role} · {show.xp.toLocaleString("de-DE")} XP</span>
                </div>
              </div>
              <div className="techProfileStripStats">
                <div><span>Diese Woche</span><strong>{fmtHoursShort(weekMinutes)}</strong></div>
                <div><span>XP</span><strong>{show.xp.toLocaleString("de-DE")}</strong></div>
                <div><span>Urlaub</span><strong>{Math.max(0, (show.vacationDaysTotal ?? 30))}</strong></div>
              </div>
            </div>
          );
        })()}
        {!isWorker && (
          <div className={`techSelectors ${isWorker ? "workerSelectors" : ""}`}>
            <div className="formField">
              <label>Techniker-Modus</label>
              <select className="select techTapSelect" value={employeeId} onChange={e=>{setEmployeeId(e.target.value);setJobId("");}}>
                <option value="">Alle Aufträge</option>
                {employees.filter(e=>e.active).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <section className="techTodayBlock">
          <div className="techSectionHead">
            <h2>Heute</h2>
            <span>{new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "short" }).format(new Date())}</span>
          </div>
          {cloudLoading ? (
            <LoadingState label="Aufträge werden geladen…" />
          ) : todayJobs.length === 0 ? (
            <EmptyState
              title="Keine Aufträge für heute"
              hint={isWorker
                ? "Dir ist heute noch kein Einsatz zugewiesen. Offene Aufträge siehst du weiter unten."
                : "Für diesen Techniker sind heute keine Einsätze geplant."}
            />
          ) : (
            <div className="techJobCards">
              {todayJobs.map(j => {
                const c = customers.find(x => x.id === j.customerId);
                const s = j.customerSiteId ? customerSites.find(x => x.id === j.customerSiteId) : undefined;
                const addr = s
                  ? [s.street, [s.postalCode, s.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || j.address
                  : (j.address || "Keine Adresse");
                const booked = todayMinutesByJob[j.id] || 0;
                return (
                  <button type="button" key={j.id} className="techJobCard" onClick={() => openJob(j.id)}>
                    <div className="techJobCardTime">{j.time || "—"}</div>
                    <div className="techJobCardBody">
                      <strong>{j.title}</strong>
                      <span>{c?.name ?? "Kunde"}{s ? ` · ${s.name}` : ""} · {addr || "Keine Adresse"}</span>
                      {s?.tenantName ? <span className="techJobCardMeta">Mieter: {s.tenantName}{s.tenantPhone ? ` · ${s.tenantPhone}` : ""}</span> : null}
                      <span className="techJobCardMeta">{j.number} · Heute gebucht: {fmtHoursShort(booked)}</span>
                    </div>
                    <div className="techJobCardStatus">
                      <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                      {j.priority !== "Normal" && <Badge tone={prioTone(j.priority)}>{j.priority}</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="techTodayBlock">
          <div className="techSectionHead">
            <h2>Offene Aufträge</h2>
            <span>{openJobs.length}</span>
          </div>
          {cloudLoading ? (
            <LoadingState label="Aufträge werden geladen…" />
          ) : openJobs.length === 0 ? (
            <EmptyState
              title="Keine offenen Aufträge"
              hint={isWorker ? "Aktuell sind dir keine offenen Aufträge zugewiesen." : "Keine offenen Aufträge für die Auswahl."}
            />
          ) : (
            <div className="techJobCards techJobCardsCompact">
              {openJobs.filter(j => j.date !== today).slice(0, 12).map(j => {
                const c = customers.find(x => x.id === j.customerId);
                const booked = todayMinutesByJob[j.id] || 0;
                return (
                  <button type="button" key={j.id} className="techJobCard" onClick={() => openJob(j.id)}>
                    <div className="techJobCardTime techJobCardDate">{formatDate(j.date)}</div>
                    <div className="techJobCardBody">
                      <strong>{j.title}</strong>
                      <span>{c?.name ?? "Kunde"} · {j.time} Uhr{booked > 0 ? ` · Heute ${fmtHoursShort(booked)}` : ""}</span>
                    </div>
                    <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                  </button>
                );
              })}
              {openJobs.filter(j => j.date !== today).length === 0 && todayJobs.length > 0 && (
                <p className="techMuted techPadHint">Alle offenen Aufträge sind für heute — tippe oben auf einen Einsatz.</p>
              )}
            </div>
          )}
        </section>

        <div className="techSelectors workerSelectors">
          <div className="formField">
            <label>{isWorker ? "Oder Auftrag aus Liste wählen" : "Auftrag öffnen"}</label>
            <select className="select techTapSelect" value={jobId} onChange={e=>{ if(e.target.value) openJob(e.target.value); }}>
              <option value="">Auftrag auswählen…</option>
              {visibleJobs.map(j=><option key={j.id} value={j.id}>{j.number} · {j.title} · {formatDate(j.date)}</option>)}
            </select>
          </div>
        </div>
      </>
    )}

    {job && (
      <>
        <section className="techJobHero">
          <div>
            <div className="techEyebrow">{job.number}</div>
            <h2>{job.title}</h2>
            <p>{customer?.name??"—"}{site ? ` · ${site.name}` : ""} · {formatDate(job.date)} · {job.time} Uhr{!isWorker && <> · {employee?.name??"Nicht zugewiesen"}</>}</p>
          </div>
          <div className="techHeroStatus">
            <Badge tone={statusTone(job.status)}>{job.status}</Badge>
            <Badge tone={prioTone(job.priority)}>{job.priority}</Badge>
            {running && <Badge tone="orange">Zeiterfassung läuft</Badge>}
          </div>
        </section>

        <section className="techAddrSplit">
          <div className="techAddrCard techAddrEinsatz">
            <small>EINSATZORT</small>
            <strong>{site?.name || "Kundenadresse"}</strong>
            <span>{einsatzAddr || job.address || "Keine Adresse"}</span>
            {navLink ? (
              <button className="techMapsLink" disabled={busy || !!running || job.status === "Erledigt" || job.status === "Storniert"} onClick={() => void startTravel()}>
                🗺 In Google Maps öffnen
              </button>
            ) : (
              <span className="techMuted">Keine Adresse für Navigation</span>
            )}
            {!!travelStatusText && <p role="status">{travelStatusText}</p>}
            {site?.tenantName || site?.tenantPhone || site?.tenantEmail ? (
              <div className="techAddrMieter">
                <span>Mieter: {site?.tenantName || "—"}</span>
                {site?.tenantPhone ? <a href={`tel:${site.tenantPhone}`}>{site.tenantPhone}</a> : null}
                {site?.tenantEmail ? <a href={`mailto:${site.tenantEmail}`}>{site.tenantEmail}</a> : null}
              </div>
            ) : null}
            {site?.notes ? <p className="techMuted">{site.notes}</p> : null}
          </div>
          <div className="techAddrCard techAddrRechnung">
            <small>RECHNUNGSADRESSE</small>
            <strong>{customer?.name || "—"}</strong>
            <span>{rechnungAddr || "—"}</span>
            {customer?.contact ? <span>Ansprechpartner: {customer.contact}</span> : null}
            {customer?.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : null}
          </div>
        </section>


        <section className="techGrid" style={{ marginBottom: 12 }}>
          <section className="techCard">
            <div className="techCardHead"><h3># Fehlercode</h3>{attachedCode && <Badge tone="blue">{attachedCode.code}</Badge>}</div>
            {attachedCode ? (
              <div className="techList">
                <div className="techListRow">
                  <div>
                    <strong>{attachedCode.code} — {attachedCode.title}</strong>
                    {attachedCode.description ? <span>{attachedCode.description}</span> : null}
                    {attachedCode.device_name || attachedCode.trade_category ? <span className="techMuted">{[attachedCode.device_name, attachedCode.trade_category].filter(Boolean).join(" · ")}</span> : null}
                  </div>
                  {job.status !== "Erledigt" && (
                    <button type="button" className="ghostBtn smallBtn" disabled={attachingCode || busy} onClick={() => void attachErrorCode(null)}>Entfernen</button>
                  )}
                </div>
              </div>
            ) : (
              <p className="techMuted">Noch kein Fehlercode am Auftrag.</p>
            )}
            {job.status !== "Erledigt" && (
              <>
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  placeholder="Code suchen (z. B. E01, keine Wärme)…"
                  value={codeQuery}
                  onChange={(e) => setCodeQuery(e.target.value)}
                />
                {filteredCodes.length === 0 ? (
                  <p className="techMuted" style={{ marginTop: 8 }}>
                    {errorCodes.length === 0 ? "Kein Katalog — Büro legt Codes unter „Fehlercodes“ an." : "Keine Treffer."}
                  </p>
                ) : (
                  <div className="techList" style={{ marginTop: 8, maxHeight: 220, overflow: "auto" }}>
                    {filteredCodes.map(c => (
                      <div className="techListRow" key={c.id}>
                        <div>
                          <strong>{c.code}</strong>
                          <span>{c.title}{[c.device_name, c.trade_category].filter(Boolean).length ? ` · ${[c.device_name, c.trade_category].filter(Boolean).join(" · ")}` : ""}</span>
                        </div>
                        <button
                          type="button"
                          className="primaryBtn smallBtn"
                          disabled={attachingCode || busy || job.errorCodeId === c.id}
                          onClick={() => void attachErrorCode(c.id)}
                        >
                          {job.errorCodeId === c.id ? "Aktiv" : "Anhängen"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="techCard">
            <div className="techCardHead"><h3>🔌 Geräte / Pläne</h3><span>{siteDevices.length}</span></div>
            {attachedDevice && (
              <div className="techWarnBanner" style={{ marginBottom: 8 }}>
                Am Auftrag: <strong>{attachedDevice.name}</strong> ({attachedDevice.device_type})
              </div>
            )}
            {siteDevices.length === 0 ? (
              <p className="techMuted">Keine Geräte für diesen Kunden/Objekt hinterlegt.</p>
            ) : (
              <div className="techList">
                {siteDevices.map(d => {
                  const href = d.planSignedUrl || d.plan_url || "";
                  const isLinked = job.siteDeviceId === d.id;
                  return (
                    <div className="techListRow" key={d.id}>
                      <div>
                        <strong>{d.name}{isLinked ? " · am Auftrag" : ""}</strong>
                        <span>{d.device_type}{[d.model, d.serial_number ? `S/N ${d.serial_number}` : ""].filter(Boolean).length ? ` · ${[d.model, d.serial_number ? `S/N ${d.serial_number}` : ""].filter(Boolean).join(" · ")}` : ""}</span>
                        {d.notes ? <span className="techMuted">{d.notes}</span> : null}
                      </div>
                      {href ? (
                        <a className="textLink" href={href} target="_blank" rel="noreferrer">Plan</a>
                      ) : (
                        <span className="techMuted">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        {detailsLoading ? <LoadingState label="Auftragsdetails werden geladen…" /> : (
          <>
            <div className="techStats">
              <div className="techStat"><span>Arbeitszeit</span><strong>{fmtDuration(actualMinutes)}</strong></div>
              <div className="techStat"><span>Heute</span><strong>{fmtHoursShort(todayBookedOnJob)}</strong></div>
              <div className="techStat"><span>Fotos</span><strong>{photos.length}{vorherPhotos.length===0 ? " · kein Vorher" : ""}</strong></div>
              <div className="techStat"><span>Checkliste</span><strong>{checklistDone}/{checklist.length}</strong></div>
            </div>

            <section className="techActionBar techStickyActions safeAreaPad">
              {!running && job.status!=="Erledigt" && (job.status!=="In Arbeit" || travelling) && (
                <button className="primaryBtn techBigBtn techArriveBtn fullWidthBtn" disabled={busy} onClick={() => void arriveAndStart()}>
                  📍 Angekommen / Zeit starten
                </button>
              )}
              {running && (
                <button className="secondaryBtn techBigBtn fullWidthBtn" disabled={busy} onClick={() => void pauseWork()}>
                  Ⅱ Pause / Zeit stoppen
                </button>
              )}
              {!running && !travelling && job.status==="In Arbeit" && (
                <button className="primaryBtn techBigBtn techArriveBtn fullWidthBtn" disabled={busy} onClick={() => void startWork()}>
                  ▶ Zeit erneut starten
                </button>
              )}
              {job.status!=="Erledigt" && (
                <button className="primaryBtn techBigBtn finishBtn fullWidthBtn" disabled={busy} onClick={() => void finishWork()}>
                  ✓ Auftrag abschließen
                </button>
              )}
              {job.status==="Erledigt" && (
                <div className="doneBannerStack">
                  <div className="doneBanner">✓ Auftrag ist abgeschlossen</div>
                  {isWorker ? (
                    <div className="notice" style={{marginTop:10}}>Fertig — das Büro erstellt die Rechnung.</div>
                  ) : (
                    <button
                      type="button"
                      className="primaryBtn techBigBtn fullWidthBtn"
                      disabled={busy || invoiceBusy}
                      onClick={() => void prepareInvoice()}
                      style={{marginTop:10}}
                    >
                      {invoiceBusy ? "Rechnung wird vorbereitet…" : "€ Rechnung vorbereiten"}
                    </button>
                  )}
                  {invoiceInfo && <div className="notice" style={{marginTop:8}}>{invoiceInfo}</div>}
                </div>
              )}
            </section>

            <div className="techGrid">
              <section className="techCard">
                <div className="techCardHead"><h3>⏱ Zeiterfassung</h3>{running&&<Badge tone="orange">Läuft</Badge>}</div>
                {entries.length===0?<p className="techMuted">Noch keine Arbeitszeit erfasst. Tippe oben auf „Angekommen / Zeit starten“.</p>:<div className="techList">{entries.map(e=><div className="techListRow" key={e.id}><div><strong>{stamp(e.started_at)}</strong><span>{e.ended_at?`bis ${stamp(e.ended_at)}`:"läuft gerade"}</span></div><b>{fmtDuration(minutesBetween(e.started_at,e.ended_at??new Date().toISOString()))}</b></div>)}</div>}
              </section>

              <section className="techCard" ref={photoSectionRef}>
                <div className="techCardHead">
                  <h3>📷 Fotos vorher → nachher</h3>
                  <span>{vorherPhotos.length} vorher · {nachherPhotos.length} nachher</span>
                </div>
                {vorherPhotos.length === 0 && job.status !== "Erledigt" && (
                  <div className="techWarnBanner">Bitte zuerst ein <strong>Vorher-Foto</strong> aufnehmen, bevor du abschließt.</div>
                )}
                <div className="photoCatTabs" role="tablist">
                  {(["vorher","nachher","sonst"] as PhotoCategory[]).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`photoCatTab ${photoCategory===cat?"active":""}`}
                      onClick={() => setPhotoCategory(cat)}
                    >
                      {catLabel(cat)}
                    </button>
                  ))}
                </div>
                <label className={`photoUpload ${busy && photoStatus ? "photoUploadBusy" : ""}`}>
                  <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{ const f=e.target.files?.[0]??null; e.target.value=""; void uploadPhoto(f, photoCategory); }}/>
                  <span>{photoStatus || `+ ${catLabel(photoCategory)}-Foto aufnehmen / auswählen`}</span>
                </label>
                {photoStatus && <p className="techMuted photoStatusHint">{photoStatus} — bitte warten.</p>}
                <div className="photoGrid">
                  {photos.map(p => p.url ? (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="photoGridItem">
                      <img src={p.url} alt={p.file_name??"Auftragsfoto"}/>
                      <span className={`photoCatBadge photoCat-${photoCat(p)}`}>{catLabel(photoCat(p))}</span>
                    </a>
                  ) : null)}
                </div>
                {photos.length===0 && <p className="techMuted">Noch keine Fotos.</p>}
              </section>

              <section className="techCard">
                <div className="techCardHead">
                  <h3>✓ Checkliste</h3>
                  <span>{checklistDone}/{checklist.length}</span>
                </div>
                <div className="techChecklist">
                  {checklist.map(item => (
                    <label key={item.id} className={`techCheckItem ${item.done ? "done" : ""}`}>
                      <input
                        type="checkbox"
                        checked={item.id === "vorher" ? vorherPhotos.length > 0 : item.id === "nachher" ? nachherPhotos.length > 0 : item.done}
                        disabled={busy || job.status==="Erledigt" || item.id === "vorher" || item.id === "nachher"}
                        onChange={() => void toggleChecklist(item.id)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </section>

              {plannedMaterials.length>0 && <section className="techCard">
                <div className="techCardHead"><h3>📋 Geplantes Material aus Angebot</h3><span>{plannedMaterials.filter(p=>!p.consumed_at).length} offen</span></div>
                <p className="techMuted">Erst beim Übernehmen wird Lagerbestand gebucht und die Nachkalkulation belastet.</p>
                <div className="plannedMaterialList">{plannedMaterials.map(p=><div className="plannedMaterialRow" key={p.id}>
                  <div><strong>{p.description}</strong><span>{Number(p.quantity)} {p.unit}{p.consumed_at ? " · verwendet" : ""}</span></div>
                  {p.consumed_at ? <Badge tone="green">Übernommen</Badge> : <div className="plannedMaterialActions">
                    <select className="select" value={plannedCatalog[p.id]||""} onChange={e=>setPlannedCatalog(x=>({...x,[p.id]:e.target.value}))}>
                      <option value="">Lagermaterial wählen…</option>{catalog.map(m=><option key={m.id} value={m.id}>{m.name} · {Number(m.stock)} {m.unit}</option>)}
                    </select>
                    <button type="button" className="ghostBtn" disabled={busy} onClick={()=>void consumePlannedMaterial(p)}>Als verwendet übernehmen</button>
                  </div>}
                </div>)}</div>
              </section>}

              <section className="techCard">
                <div className="techCardHead"><h3>🧰 Material</h3><span>{isWorker ? `${materials.length} Positionen` : materialTotal.toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</span></div>
                <form className={`techInlineForm ${isWorker ? "workerMaterialForm" : ""}`} onSubmit={addMaterial}>
                  <select className="select" value={catalogId} onChange={e=>{setCatalogId(e.target.value);const m=catalog.find(x=>x.id===e.target.value);if(m)setMaterial(v=>({...v,name:m.name,unit:m.unit}))}}>
                    <option value="">Freies Material…</option>
                    {catalog.map(m=><option key={m.id} value={m.id}>{m.name} · Bestand {Number(m.stock)} {m.unit}</option>)}
                  </select>
                  {!catalogId&&<input className="input" placeholder="Material" value={material.name} onChange={e=>setMaterial({...material,name:e.target.value})}/>}
                  <input className="input smallInput" type="number" min="0.001" step="0.001" value={material.quantity} onChange={e=>setMaterial({...material,quantity:e.target.value})}/>
                  {!catalogId&&<input className="input smallInput" placeholder="Einheit" value={material.unit} onChange={e=>setMaterial({...material,unit:e.target.value})}/>}
                  {!isWorker&&!catalogId&&<input className="input smallInput" type="number" min="0" step="0.01" value={material.price} onChange={e=>setMaterial({...material,price:e.target.value})}/>}
                  <button className="primaryBtn" disabled={busy}>Hinzufügen</button>
                </form>
                <div className="techList">{materials.map(m=><div className="techListRow" key={m.id}><div><strong>{m.material_name}</strong><span>{Number(m.quantity)} {m.unit}{isWorker ? "" : ` × ${Number(m.unit_price).toLocaleString("de-DE",{style:"currency",currency:"EUR"})}`}</span></div><div className="formActions">{!isWorker&&<b>{(Number(m.quantity)*Number(m.unit_price)).toLocaleString("de-DE",{style:"currency",currency:"EUR"})}</b>}<button type="button" className="ghostBtn smallBtn" disabled={busy} onClick={()=>void removeMaterial(m.id)}>Entfernen</button></div></div>)}</div>
              </section>

              <section className="techCard">
                <div className="techCardHead"><h3>📝 Notizen</h3><span>{notes.length}</span></div>
                <form onSubmit={addNote}><textarea className="textarea techTextarea" placeholder="Was wurde gemacht? Hinweise für Büro oder Kunde…" value={note} onChange={e=>setNote(e.target.value)}/><button className="primaryBtn fullWidthBtn" disabled={busy||!note.trim()}>Notiz speichern</button></form>
                <div className="techNotes">{notes.map(n=><div className="techNote" key={n.id}><p>{n.note}</p><span>{stamp(n.created_at)}</span></div>)}</div>
              </section>

              <section className="techCard signatureCard">
                <div className="techCardHead"><h3>✍ Kundenunterschrift</h3>{signature&&<Badge tone="green">Gespeichert</Badge>}</div>
                {signature?.url&&<div className="savedSignature"><img src={signature.url} alt="Gespeicherte Kundenunterschrift"/><span>{signature.signer_name||"Kunde"}</span></div>}
                <input className="input" placeholder="Name des Unterzeichners" value={signerName} onChange={e=>setSignerName(e.target.value)}/>
                <canvas ref={canvasRef} className="signatureCanvas" width={900} height={260} onPointerDown={beginDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerCancel={endDraw}/>
                <div className="signatureActions"><button className="ghostBtn" type="button" onClick={clearSignature}>Leeren</button><button className="primaryBtn" type="button" disabled={busy} onClick={() => void saveSignature()}>Unterschrift speichern</button></div>
              </section>
            </div>
          </>
        )}
      </>
    )}
  </main>;
}
