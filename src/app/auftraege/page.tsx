"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, LoadingState, Modal, PageHeader } from "@/components/UI";
import Auftragsakte from "@/components/Auftragsakte";
import { useAppData } from "@/context/AppDataProvider";
import type { Job, JobStatus } from "@/lib/types";
import { euro, formatDate, formatCloudError } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";
import { readAllRows } from "@/lib/readAllRows";
import { useCompany } from "@/context/CompanyProvider";
import { invoicePreviewHref, prepareInvoiceFromJob } from "@/lib/invoiceFromJob";

type ErrorCodeOpt = { id: string; code: string; title: string; trade_category: string | null; device_name: string | null; active: boolean };
type DeviceOpt = { id: string; name: string; device_type: string; customer_id: number; customer_site_id: string | null; active: boolean };

function todayLocal() { return new Date().toLocaleDateString("en-CA"); }
function statusTone(status: JobStatus) { return status === "Erledigt" ? "green" : status === "In Arbeit" ? "orange" : status === "Storniert" ? "red" : "blue"; }

const blankForm = { title:"", customerId:"", customerSiteId:"", siteDeviceId:"", errorCodeId:"", employeeId:"", date:todayLocal(), time:"08:00", priority:"Normal", address:"", description:"", estimatedHours:"2", materialCost:"0" };

export default function JobsPage() {
  const { jobs, customers, customerSites, employees, addJob, updateJob, removeJob, cloudLoading, cloudError } = useAppData();
  const { company, role } = useCompany();
  const router = useRouter();
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("Alle"); const [phoneFilter, setPhoneFilter] = useState<"alle" | "aktiv" | "erledigt">("alle"); const [open, setOpen] = useState(false); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [errorCodes, setErrorCodes] = useState<ErrorCodeOpt[]>([]);
  const [devices, setDevices] = useState<DeviceOpt[]>([]);
  const [catalogErr, setCatalogErr] = useState("");
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const [invoiceErr, setInvoiceErr] = useState("");
  const [akteJobId, setAkteJobId] = useState<string | null>(null);
  const canPrepareInvoice = role === "owner" || role === "admin";
  const canOpenAkte = role === "owner" || role === "admin";

  useEffect(() => {
    if (typeof window === "undefined" || !canOpenAkte) return;
    const id = new URLSearchParams(window.location.search).get("akte");
    if (id) setAkteJobId(id);
  }, [canOpenAkte, jobs.length]);

  useEffect(() => {
    const s = getSupabaseClient();
    if (!s || !company) return;
    let cancelled = false;
    (async () => {
      const [ec, dv] = await Promise.all([
        readAllRows((from, to) => s.from("error_codes").select("id,code,title,trade_category,device_name,active").eq("company_id", company.id).eq("active", true).order("code").order("id").range(from, to)),
        s.from("site_devices").select("id,name,device_type,customer_id,customer_site_id,active").eq("company_id", company.id).eq("active", true).order("name"),
      ]);
      if (cancelled) return;
      if (ec.error || dv.error) setCatalogErr(formatCloudError((ec.error || dv.error)!.message));
      else {
        setErrorCodes((ec.data ?? []) as ErrorCodeOpt[]);
        setDevices((dv.data ?? []) as DeviceOpt[]);
      }
    })();
    return () => { cancelled = true; };
  }, [company?.id]);

  const sitesForCustomer = useMemo(
    () => customerSites.filter((s) => s.customerId === form.customerId && s.active),
    [customerSites, form.customerId]
  );
  const devicesForCustomer = useMemo(
    () => devices.filter((d) => String(d.customer_id) === form.customerId && d.active && (!form.customerSiteId || !d.customer_site_id || d.customer_site_id === form.customerSiteId)),
    [devices, form.customerId, form.customerSiteId]
  );

  const filtered = useMemo(() => jobs.filter((j) => {
    const c = customers.find((x)=>x.id===j.customerId);
    const site = j.customerSiteId ? customerSites.find((s)=>s.id===j.customerSiteId) : undefined;
    const phone = c?.phone ?? "";
    const hit = `${j.number} ${j.title} ${c?.name??""} ${j.address} ${phone} ${j.description} ${site?.name??""} ${site?.tenantName??""}`.toLowerCase().includes(query.toLowerCase());
    return hit && (status === "Alle" || j.status === status);
  }), [jobs, customers, customerSites, query, status]);

  const phoneJobs = useMemo(() => jobs.filter((j) => {
    const c = customers.find((x) => x.id === j.customerId);
    const hit = `${j.number} ${j.title} ${c?.name ?? ""} ${j.address}`.toLowerCase().includes(query.toLowerCase());
    if (!hit) return false;
    if (phoneFilter === "aktiv") return j.status === "Geplant" || j.status === "In Arbeit";
    if (phoneFilter === "erledigt") return j.status === "Erledigt";
    return true;
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [jobs, customers, query, phoneFilter]);
  const phoneCounts = useMemo(() => ({
    alle: jobs.length,
    aktiv: jobs.filter((j) => j.status === "Geplant" || j.status === "In Arbeit").length,
    erledigt: jobs.filter((j) => j.status === "Erledigt").length,
  }), [jobs]);

  const akteJob: Job | undefined = akteJobId ? jobs.find((j) => j.id === akteJobId) : undefined;
  const akteDevice = akteJob?.siteDeviceId ? devices.find((d) => d.id === akteJob.siteDeviceId) : undefined;
  const akteCode = akteJob?.errorCodeId ? errorCodes.find((c) => c.id === akteJob.errorCodeId) : undefined;

  function applySite(customerId: string, siteId: string) {
    const customer = customers.find((c)=>c.id===customerId);
    const site = siteId ? customerSites.find((s)=>s.id===siteId) : undefined;
    let address = "";
    if (site) {
      address = [site.street, [site.postalCode, site.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    } else if (customer) {
      address = [customer.street, [customer.postalCode, customer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    }
    setForm((f)=>({...f, customerId, customerSiteId: siteId, siteDeviceId: "", address}));
  }

  function openNew() {
    const cid = customers[0]?.id ?? "";
    const sites = customerSites.filter((s)=>s.customerId===cid && s.active);
    applySite(cid, sites[0]?.id ?? "");
    setForm((f)=>({...blankForm, customerId:cid, customerSiteId:sites[0]?.id??"", employeeId:"", date:todayLocal(),
      address: sites[0]
        ? [sites[0].street, [sites[0].postalCode, sites[0].city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
        : (customers[0] ? [customers[0].street, [customers[0].postalCode, customers[0].city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "")
    }));
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!form.title || !form.customerId) return;
    const customer = customers.find((c)=>c.id===form.customerId);
    const site = form.customerSiteId ? customerSites.find((s)=>s.id===form.customerSiteId) : undefined;
    setSaving(true);
    const fallbackAddr = customer ? `${customer.street}, ${customer.postalCode} ${customer.city}`.replace(/^,\s*|,\s*$/g,"").trim() : "";
    const siteAddr = site ? [site.street, [site.postalCode, site.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
    const ok = await addJob({
      number:`AU-${new Date().getFullYear()}-${String(1001 + jobs.length).padStart(4,"0")}`, title:form.title, customerId:form.customerId,
      customerSiteId: form.customerSiteId || undefined,
      siteDeviceId: form.siteDeviceId || undefined,
      errorCodeId: form.errorCodeId || undefined,
      employeeId:form.employeeId,
      date:form.date, time:form.time, status:"Geplant", priority:form.priority as "Normal"|"Hoch"|"Notfall",
      address:form.address || siteAddr || fallbackAddr, description:form.description,
      estimatedHours:Number(form.estimatedHours||0), materialCost:Number(form.materialCost||0)
    });
    if (ok) { setOpen(false); setForm(blankForm); }
    setSaving(false);
  }

  async function onPrepareInvoice(jobId: string) {
    if (!canPrepareInvoice) return;
    setInvoiceBusyId(jobId);
    setInvoiceErr("");
    setInvoiceMsg("");
    try {
      const row = await prepareInvoiceFromJob(jobId);
      setInvoiceMsg(
        row.already_existed
          ? `Rechnung ${row.document_number} ist bereits vorhanden — öffne Vorschau.`
          : `Entwurf ${row.document_number} vorbereitet.`
      );
      router.push(invoicePreviewHref(row.id));
    } catch (err: unknown) {
      setInvoiceErr(formatCloudError(err instanceof Error ? err.message : String(err)));
    } finally {
      setInvoiceBusyId(null);
    }
  }

  function phoneStatusLabel(jobStatus: JobStatus) {
    return jobStatus;
  }
  function phoneWhen(value: string) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }

  return <main className="page">
    <div className="phoneJobs phoneOnly">
      <h1>Aufträge</h1>
      {cloudError && <div className="phoneError">{cloudError}</div>}
      <label className="phoneSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Auftrag suchen" />
      </label>
      <div className="phoneChips">
        {(["alle", "aktiv", "erledigt"] as const).map((key) => (
          <button key={key} type="button" className={phoneFilter === key ? "phoneChip active" : "phoneChip"} onClick={() => setPhoneFilter(key)}>
            {key === "alle" ? "Alle" : key === "aktiv" ? "Aktiv" : "Erledigt"} ({phoneCounts[key]})
          </button>
        ))}
      </div>
      {cloudLoading ? <div className="phoneEmpty">Aufträge werden geladen…</div> : phoneJobs.length === 0 ? <div className="phoneEmpty">Keine Aufträge für diesen Filter.</div> : phoneJobs.map((j) => {
        const customer = customers.find((c) => c.id === j.customerId);
        const tone = j.status === "Erledigt" || j.status === "Storniert" ? "done" : j.status === "In Arbeit" ? "work" : "active";
        return (
          <button type="button" className="phoneJob" key={j.id} onClick={() => canOpenAkte && setAkteJobId(j.id)}>
            <span className="phoneJobTop">
              <strong>{customer?.name ?? "Kunde"}</strong>
              <em className={tone}>{phoneStatusLabel(j.status)}</em>
            </span>
            <span className="phoneJobNo">{j.number}</span>
            <span className="phoneJobBottom">
              <span>
                <b>{j.title}</b>
                <small>{phoneWhen(j.date)}</small>
              </span>
              {j.suggestedPrice ? <b className="phoneJobPrice">{euro(j.suggestedPrice)}</b> : null}
            </span>
            <span className="phoneChevron" aria-hidden="true">›</span>
          </button>
        );
      })}
      <button type="button" className="phoneFab" onClick={openNew} disabled={customers.length === 0} aria-label="Neuer Auftrag">+</button>
    </div>
    <div className="deskOnly">
    <PageHeader title="Aufträge" subtitle="Kunde → Objekt/Einsatzort → Techniker → Akte → Rechnung vorbereiten" action={<button className="primaryBtn" onClick={openNew} disabled={customers.length===0}>+ Neuer Auftrag</button>} />
    <div className="cloudNotice"><span className="cloudDot" /> Büro: Auftragsakte öffnen — Zeit, Material, Checkliste, Fotos · Lieferschein / Rechnung aus dem Feld.</div>
    {customers.length===0 && <div className="notice">Lege zuerst mindestens einen Kunden an. Danach kannst du einen Auftrag erstellen.</div>}
    {cloudError && <div className="loginError pageError">{cloudError}</div>}
    {catalogErr && <div className="loginError pageError">{catalogErr}</div>}
    {invoiceErr && <div className="loginError pageError">{invoiceErr}</div>}
    {invoiceMsg && <div className="notice">{invoiceMsg}</div>}
    <div className="toolbar"><div className="toolbarLeft"><input className="searchInput" placeholder="Nr., Titel, Kunde, Objekt, Adresse, Telefon..." value={query} onChange={(e)=>setQuery(e.target.value)} /><select className="select" value={status} onChange={(e)=>setStatus(e.target.value)}><option>Alle</option><option>Geplant</option><option>In Arbeit</option><option>Erledigt</option><option>Storniert</option></select></div><div className="toolbarRight"><span className="cellSub">{filtered.length} {filtered.length === 1 ? "Auftrag" : "Aufträge"}</span></div></div>
    <div className="tableWrap">{cloudLoading ? <LoadingState label="Aufträge werden geladen…" /> : filtered.length===0 ? <EmptyState title={query || status!=="Alle" ? "Keine Treffer" : "Noch keine Aufträge"} hint={query || status!=="Alle" ? "Suche oder Filter anpassen." : "Lege den ersten Auftrag mit „+ Neuer Auftrag“ an."} /> : <table className="dataTable"><thead><tr><th>Auftrag</th><th>Kunde / Einsatzort</th><th>Termin</th><th>Techniker</th><th>Priorität</th><th>Status</th><th></th></tr></thead><tbody>
      {filtered.map((j)=>{ const customer=customers.find(c=>c.id===j.customerId); const site=j.customerSiteId?customerSites.find(s=>s.id===j.customerSiteId):undefined; const employee=employees.find(e=>e.id===j.employeeId); return <tr key={j.id} className={akteJobId===j.id?"rowCalcActive":undefined}>
        <td>
          {canOpenAkte ? (
            <button type="button" className="akteTitleBtn" onClick={() => setAkteJobId(j.id)}>
              <span className="cellTitle">{j.title}</span>
              <span className="cellSub">{j.number}</span>
            </button>
          ) : (
            <><span className="cellTitle">{j.title}</span><span className="cellSub">{j.number}</span></>
          )}
        </td>
        <td>{customer?.name??"—"}{site ? <span className="cellSub">{site.name}{site.tenantName?` · Mieter: ${site.tenantName}`:""}</span> : null}<span className="cellSub">{j.address}</span>{j.siteDeviceId ? <span className="cellSub">Gerät: {devices.find(d=>d.id===j.siteDeviceId)?.name??"—"}</span> : null}{j.errorCodeId ? <span className="cellSub">Code: {errorCodes.find(c=>c.id===j.errorCodeId)?.code??"—"}</span> : null}</td>
        <td>{formatDate(j.date)}<span className="cellSub">{j.time} Uhr</span></td>
        <td><select className="select" value={j.employeeId} onChange={(e)=>updateJob(j.id,{employeeId:e.target.value})}><option value="">Nicht zugewiesen</option>{employees.filter(e=>e.active).map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select></td>
        <td><Badge tone={j.priority==="Notfall"?"red":j.priority==="Hoch"?"yellow":"gray"}>{j.priority}</Badge></td>
        <td><select className="select" value={j.status} onChange={(e)=>updateJob(j.id,{status:e.target.value as JobStatus})}><option>Geplant</option><option>In Arbeit</option><option>Erledigt</option><option>Storniert</option></select><div style={{marginTop:6}}><Badge tone={statusTone(j.status)}>{j.status}</Badge></div></td>
        <td><div className="rowActions">
          {canOpenAkte && (
            <button type="button" className="ghostBtn smallBtn" onClick={() => setAkteJobId(j.id)}>Akte</button>
          )}
          <Link className="textLink" href={`/techniker?job=${j.id}`}>Techniker</Link>
          {canPrepareInvoice && j.status === "Erledigt" ? (
            <button
              type="button"
              className="primaryBtn smallBtn"
              disabled={invoiceBusyId === j.id}
              onClick={() => void onPrepareInvoice(j.id)}
            >
              {invoiceBusyId === j.id ? "…" : "Rechnung vorbereiten"}
            </button>
          ) : canPrepareInvoice ? (
            <Link className="textLink" href={`/rechnungen?job=${j.id}&customer=${j.customerId}`}>Rechnung</Link>
          ) : null}
          <button className="dangerLink" onClick={()=>confirm(`Auftrag „${j.title}“ löschen?`) && removeJob(j.id)}>Löschen</button>
        </div></td>
      </tr>})}
    </tbody></table>}</div>
    </div>

    {open && <Modal title="Neuer Auftrag" subtitle="Objekt/Einsatzort wählen — Rechnung bleibt beim Kunden" onClose={()=>setOpen(false)}><form onSubmit={submit}><div className="formGrid">
      <div className="formField wide"><label>Titel *</label><input className="input" required value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="z.B. Heizungswartung" /></div>
      <div className="formField"><label>Kunde *</label><select className="select" required value={form.customerId} onChange={(e)=>{
        const cid=e.target.value;
        const sites=customerSites.filter(s=>s.customerId===cid && s.active);
        applySite(cid, sites[0]?.id ?? "");
      }}><option value="">Bitte wählen</option>{customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></div>
      <div className="formField"><label>Objekt / Einsatzort</label><select className="select" value={form.customerSiteId} onChange={(e)=>applySite(form.customerId, e.target.value)} disabled={!form.customerId}>
        <option value="">Kein Objekt (Kundenadresse)</option>
        {sitesForCustomer.map(s=><option value={s.id} key={s.id}>{s.name}{s.tenantName?` — ${s.tenantName}`:""}</option>)}
      </select>
      {form.customerId && sitesForCustomer.length===0 && <span className="cellSub" style={{marginTop:6,display:"block"}}>Noch kein Objekt — unter Kunden anlegen (optional).</span>}
      </div>
      <div className="formField"><label>Mitarbeiter</label><select className="select" value={form.employeeId} onChange={(e)=>setForm({...form,employeeId:e.target.value})}><option value="">Nicht zugewiesen</option>{employees.filter(e=>e.active).map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></div>
      <div className="formField"><label>Datum</label><input className="input" type="date" value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})} /></div>
      <div className="formField"><label>Uhrzeit</label><input className="input" type="time" value={form.time} onChange={(e)=>setForm({...form,time:e.target.value})} /></div>
      <div className="formField"><label>Priorität</label><select className="select" value={form.priority} onChange={(e)=>setForm({...form,priority:e.target.value})}><option>Normal</option><option>Hoch</option><option>Notfall</option></select></div>
      <div className="formField"><label>Geschätzte Stunden</label><input className="input" type="number" min="0" step="0.5" value={form.estimatedHours} onChange={(e)=>setForm({...form,estimatedHours:e.target.value})} /></div>
      <div className="formField wide"><label>Einsatzadresse</label><input className="input" value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} placeholder="Wird vom Objekt übernommen" /></div>
      <div className="formField"><label>Gerät / Anlage</label><select className="select" value={form.siteDeviceId} onChange={(e)=>setForm({...form,siteDeviceId:e.target.value})} disabled={!form.customerId}>
        <option value="">Kein Gerät</option>
        {devicesForCustomer.map(d=><option value={d.id} key={d.id}>{d.name} ({d.device_type})</option>)}
      </select>
      {form.customerId && devicesForCustomer.length===0 && <span className="cellSub" style={{marginTop:6,display:"block"}}>Keine Geräte — unter „Geräte“ anlegen.</span>}
      </div>
      <div className="formField"><label>Fehlercode</label><select className="select" value={form.errorCodeId} onChange={(e)=>setForm({...form,errorCodeId:e.target.value})}>
        <option value="">Kein Code</option>
        {errorCodes.map(c=><option value={c.id} key={c.id}>{c.code} — {c.title}{c.device_name ? ` · ${c.device_name}` : ""}</option>)}
      </select></div>
      <div className="formField wide"><label>Beschreibung</label><textarea className="textarea" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} /></div>
    </div><div className="formActions"><button type="button" className="ghostBtn" onClick={()=>setOpen(false)}>Abbrechen</button><button className="primaryBtn" disabled={saving}>{saving?"Speichert...":"Auftrag speichern"}</button></div></form></Modal>}

    {akteJob && canOpenAkte && (
      <Auftragsakte
        job={akteJob}
        meta={{
          deviceName: akteDevice?.name,
          deviceType: akteDevice?.device_type,
          errorCode: akteCode?.code,
          errorTitle: akteCode?.title,
        }}
        canPrepareInvoice={canPrepareInvoice}
        canPrepareDeliveryNote={canPrepareInvoice}
        onClose={() => setAkteJobId(null)}
      />
    )}
  </main>;
}
