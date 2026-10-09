"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, EmptyState, LoadingState, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { invoicePreviewHref, prepareInvoiceFromJob } from "@/lib/invoiceFromJob";
import { createJobFromOffer, jobAkteHref } from "@/lib/createJobFromOffer";
import { invoiceRemainder, isInvoiceOverdue } from "@/lib/invoiceStatus";
import { promoteOverdueInvoices } from "@/lib/promoteOverdueInvoices";
import { getSupabaseClient } from "@/lib/supabase";
import { euro, initials, formatCloudError, formatDate } from "@/lib/utils";
import PhoneHome from "@/components/PhoneHome";

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Wave() {
  return (
    <svg className="dashWave" viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 58c50-30 90 8 140-8s90-4 130 12 70 8 130-24v52H0z" />
    </svg>
  );
}

function Bolt() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { role, company } = useCompany();
  const { jobs, employees, customers, cloudLoading, cloudError, reloadCloud } = useAppData();
  const today = new Date().toLocaleDateString("en-CA");
  const todayLabel = new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(new Date());
  const todayJobs = jobs.filter((j) => j.date === today).slice(0, 8);

  const [openInvoiceAmount, setOpenInvoiceAmount] = useState(0);
  const [openInvoiceCount, setOpenInvoiceCount] = useState(0);
  const [overdueInvoiceCount, setOverdueInvoiceCount] = useState(0);
  const [overdueInvoiceAmount, setOverdueInvoiceAmount] = useState(0);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [invoicedJobIds, setInvoicedJobIds] = useState<Set<string>>(new Set());
  const [gapBusyId, setGapBusyId] = useState<string | null>(null);
  const [gapMsg, setGapMsg] = useState("");
  const [gapErr, setGapErr] = useState("");

  type PendingOffer = {
    id: string;
    document_number: string;
    title: string | null;
    customer_id: number;
    total_amount: number;
    customer_response_at: string | null;
    converted_job_id: string | null;
  };
  const [pendingOffers, setPendingOffers] = useState<PendingOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerBusyId, setOfferBusyId] = useState<string | null>(null);
  const [offerMsg, setOfferMsg] = useState("");
  const [offerErr, setOfferErr] = useState("");

  useEffect(() => {
    (async () => {
      const s = getSupabaseClient();
      if (!s || !company || role === "worker") {
        setOpenInvoiceAmount(0);
        setOpenInvoiceCount(0);
        setOverdueInvoiceCount(0);
        setOverdueInvoiceAmount(0);
        setInvoicedJobIds(new Set());
        return;
      }
      setInvoiceLoading(true);
      setInvoiceError("");
      await promoteOverdueInvoices(company.id);
      const todayIso = new Date().toLocaleDateString("en-CA");
      const { data, error } = await s
        .from("documents")
        .select("id,job_id,total_amount,amount_paid,status,due_date,paid_at")
        .eq("company_id", company.id)
        .eq("doc_type", "invoice");
      if (error) {
        setInvoiceError(formatCloudError(error.message));
        setOpenInvoiceAmount(0);
        setOpenInvoiceCount(0);
        setOverdueInvoiceCount(0);
        setOverdueInvoiceAmount(0);
        setInvoicedJobIds(new Set());
        setInvoiceLoading(false);
        return;
      }
      const rows = data ?? [];
      const open = rows.filter((d: any) => !d.paid_at && (d.status === "Offen" || d.status === "Überfällig") && invoiceRemainder(d.total_amount, d.amount_paid) > 0);
      setOpenInvoiceAmount(open.reduce((sum: number, d: any) => sum + invoiceRemainder(d.total_amount, d.amount_paid), 0));
      setOpenInvoiceCount(open.length);
      const overdue = rows.filter((d: any) =>
        isInvoiceOverdue(
          { doc_type: "invoice", status: d.status, due_date: d.due_date, paid_at: d.paid_at, total_amount: Number(d.total_amount || 0), amount_paid: Number(d.amount_paid || 0) },
          todayIso
        )
      );
      setOverdueInvoiceCount(overdue.length);
      setOverdueInvoiceAmount(overdue.reduce((sum: number, d: any) => sum + invoiceRemainder(d.total_amount, d.amount_paid), 0));
      const linked = new Set<string>();
      for (const d of rows as any[]) {
        if (d.job_id && d.status !== "Storniert" && d.status !== "Stornorechnung") linked.add(String(d.job_id));
      }
      setInvoicedJobIds(linked);
      setInvoiceLoading(false);
    })();
  }, [company?.id, role, jobs.length]);

  useEffect(() => {
    (async () => {
      const s = getSupabaseClient();
      if (!s || !company || role === "worker") {
        setPendingOffers([]);
        return;
      }
      setOffersLoading(true);
      setOfferErr("");
      const { data, error } = await s
        .from("documents")
        .select("id,document_number,title,customer_id,total_amount,customer_response_at,converted_job_id,status")
        .eq("company_id", company.id)
        .eq("doc_type", "offer")
        .eq("status", "Angenommen")
        .order("customer_response_at", { ascending: false })
        .limit(20);
      if (error) {
        setOfferErr(formatCloudError(error.message));
        setPendingOffers([]);
        setOffersLoading(false);
        return;
      }
      const rows = ((data ?? []) as PendingOffer[]).filter((d) => !d.converted_job_id);
      setPendingOffers(rows);
      setOffersLoading(false);
    })();
  }, [company?.id, role, jobs.length]);

  async function onCreateJobFromOffer(docId: string) {
    setOfferBusyId(docId);
    setOfferErr("");
    setOfferMsg("");
    try {
      const row = await createJobFromOffer(docId);
      setOfferMsg(
        row.already_existed
          ? `Auftrag ${row.job_number} war bereits verknüpft.`
          : `Auftrag ${row.job_number} erstellt.`
      );
      setPendingOffers((prev) => prev.filter((o) => o.id !== docId));
      await reloadCloud();
      router.push(jobAkteHref(row.id));
    } catch (e) {
      setOfferErr(e instanceof Error ? e.message : "Auftrag konnte nicht erstellt werden.");
    }
    setOfferBusyId(null);
  }

  const billingGapJobs = useMemo(() => {
    if (role === "worker") return [];
    return jobs
      .filter((j) => j.status === "Erledigt" && !invoicedJobIds.has(j.id))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 12);
  }, [jobs, invoicedJobIds, role]);

  async function onPrepareGapInvoice(jobId: string) {
    setGapBusyId(jobId);
    setGapErr("");
    setGapMsg("");
    try {
      const row = await prepareInvoiceFromJob(jobId);
      setGapMsg(
        row.already_existed
          ? `Rechnung ${row.document_number} ist bereits vorhanden — öffne Vorschau.`
          : `Entwurf ${row.document_number} vorbereitet.`
      );
      setInvoicedJobIds((prev) => {
        const next = new Set(prev);
        next.add(jobId);
        return next;
      });
      router.push(invoicePreviewHref(row.id));
    } catch (err: unknown) {
      setGapErr(formatCloudError(err instanceof Error ? err.message : String(err)));
    } finally {
      setGapBusyId(null);
    }
  }

  if (role === "worker") {
    const open = jobs.filter((j) => !["Erledigt", "Storniert"].includes(j.status));
    return (
      <main className="page">
        <PageHeader title="Heute" subtitle="Deine zugewiesenen Aufträge" action={<Link className="primaryBtn" href="/techniker">Meine Aufträge öffnen</Link>} />
        <div className="cloudNotice"><span className="cloudDot" /> Du siehst nur Aufträge, die deinem Mitarbeiterkonto zugewiesen sind.</div>
        {cloudError && <div className="loginError pageError">{cloudError}</div>}
        <section className="statsGrid workerStats">
          <StatCard label="Heute" value={cloudLoading ? "…" : String(todayJobs.length)} hint={todayLabel} />
          <StatCard label="Offen" value={cloudLoading ? "…" : String(open.length)} hint="Deine Aufträge" />
          <StatCard label="Erledigt" value={cloudLoading ? "…" : String(jobs.filter((j) => j.status === "Erledigt").length)} hint="Zugewiesene Aufträge" />
        </section>
        <section className="panel">
          <div className="panelHead"><div><h2>Heutige Einsätze</h2><p>{todayLabel}</p></div><Link className="textLink" href="/techniker">Alle meine Aufträge →</Link></div>
          {todayJobs.length === 0 ? (
            <EmptyState title="Keine Einsätze heute" hint="Für heute ist dir noch kein Auftrag zugewiesen." />
          ) : (
            todayJobs.map((job) => {
              const customer = customers.find((c) => c.id === job.customerId);
              return (
                <Link href={`/techniker?job=${job.id}`} className="jobListRow workerJobLink" key={job.id}>
                  <div className="jobTime">{job.time}</div>
                  <div><h3>{job.title}</h3><p>{customer?.name ?? "Kunde"} · {job.address || "Keine Adresse"}</p></div>
                  <Badge tone={job.status === "In Arbeit" ? "orange" : job.status === "Erledigt" ? "green" : "blue"}>{job.status}</Badge>
                </Link>
              );
            })
          )}
        </section>
      </main>
    );
  }

  const openJobs = jobs.filter((j) => j.status !== "Erledigt" && j.status !== "Storniert").length;
  const invoiceValue = invoiceLoading || cloudLoading ? "…" : euro(openInvoiceAmount);
  const invoiceHint = invoiceError || (openInvoiceCount === 0 ? "Keine offenen Rechnungen" : "Offene und überfällige Rechnungen");
  const overdueHint = invoiceError || (overdueInvoiceCount === 0 ? "Keine überfällige Rechnung" : `${euro(overdueInvoiceAmount)} offen`);

  const phoneToday = todayJobs.map((job) => ({
    id: job.id,
    title: job.title,
    who: customers.find((c) => c.id === job.customerId)?.name ?? "Kunde",
    when: job.time ? `Heute, ${job.time}` : "Heute",
    href: `/auftraege?akte=${job.id}`,
    kind: /liefer/i.test(job.title) ? "truck" as const : "doc" as const,
  }));

  return (
    <>
    <PhoneHome
      openJobs={openJobs}
      openInvoices={openInvoiceCount}
      loading={cloudLoading || invoiceLoading}
      alert={overdueInvoiceCount > 0}
      today={phoneToday}
      error={cloudError || invoiceError}
    />
    <main className="page dashPage deskOnly">
      <div className="dashHead">
        <div className="dashTitle">
          <span className="dashTitleIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
          </span>
          <div>
            <h1>Dashboard</h1>
            <p>Firmenübersicht</p>
          </div>
        </div>
        <Link className="primaryBtn dashNewBtn" href="/auftraege">+ Neuer Auftrag</Link>
      </div>
      <div className="schnellstartStrip" aria-label="Schnellstart">
        <span className="schnellstartLabel"><Bolt /> Schnellstart</span>
        <div className="workflowStrip schnellstartChips">
          <Link className="workflowChip" href="/leads"><b>1</b> Lead</Link>
          <span className="schnellstartArrow" aria-hidden="true">→</span>
          <Link className="workflowChip" href="/angebote"><b>2</b> Angebot</Link>
          <span className="schnellstartArrow" aria-hidden="true">→</span>
          <Link className="workflowChip" href="/auftraege"><b>3</b> Auftrag</Link>
          <span className="schnellstartArrow" aria-hidden="true">→</span>
          <Link className="workflowChip" href="/techniker"><b>4</b> Techniker</Link>
          <span className="schnellstartArrow" aria-hidden="true">→</span>
          <Link className="workflowChip" href="/rechnungen"><b>5</b> Rechnung</Link>
        </div>
        <span className="schnellstartLabel schnellstartLabelSecondary">Mehr</span>
        <div className="workflowStrip schnellstartChips schnellstartSecondary" aria-label="Weitere Shortcuts">
          <Link className="workflowChip workflowChipQuiet" href="/mahnungen"><Glyph d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 1.5V9h4.5" /> Mahnungen</Link>
          <Link className="workflowChip workflowChipQuiet" href="/versand"><Glyph d="M3 11l18-8-8 18-2-7-8-3z" /> Versand</Link>
          <Link className="workflowChip workflowChipQuiet" href="/vorlagen"><Glyph d="M8 7h11v13H8zM5 4h11v3" /> Vorlagen</Link>
          <Link className="workflowChip workflowChipQuiet" href="/fehlercodes"><Glyph d="M12 3l9 16H3L12 3zm0 6v4m0 3h.01" /> Fehlercodes</Link>
          <Link className="workflowChip workflowChipQuiet" href="/geraete"><Glyph d="M4 5h16v10H4zM8 19h8M12 15v4" /> Geräte</Link>
          <Link className="workflowChip workflowChipQuiet" href="/heute"><Glyph d="M5 5h14v14H5zM5 9h14M9 3v4M15 3v4" /> Heute</Link>
          <Link className="workflowChip workflowChipQuiet" href="/wiederkehrend"><Glyph d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /> Wiederkehrend</Link>
        </div>
      </div>
      {cloudError && <div className="loginError pageError">{cloudError}</div>}
      {invoiceError && <div className="loginError pageError">{invoiceError}</div>}
      {gapErr && <div className="loginError pageError">{gapErr}</div>}
      {gapMsg && <div className="cloudNotice">{gapMsg}</div>}
      <section className="statsGrid dashStats">
        <Link className="dashStat tone-blue" href="/auftraege">
          <span className="dashStatTop"><span className="dashStatIcon"><Glyph d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /></span><span className="dashStatLabel">Offene Aufträge</span></span>
          <strong>{cloudLoading ? "…" : String(openJobs)}</strong>
          <small><Glyph d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /> {todayJobs.length} heute</small>
          <span className="dashStatArrow" aria-hidden="true"><Glyph d="M9 6l6 6-6 6" /></span>
          <Wave />
        </Link>
        <Link className="dashStat tone-purple" href="/kunden">
          <span className="dashStatTop"><span className="dashStatIcon"><Glyph d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 20v-1.2a3 3 0 0 0-2.2-2.9M16 2.5a3 3 0 0 1 0 5.5" /></span><span className="dashStatLabel">Kunden</span></span>
          <strong>{cloudLoading ? "…" : String(customers.length)}</strong>
          <small><Glyph d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 20a6 6 0 0 1 12 0" /> Firmenkunden</small>
          <span className="dashStatArrow" aria-hidden="true"><Glyph d="M9 6l6 6-6 6" /></span>
          <Wave />
        </Link>
        <Link className="dashStat tone-green" href="/rechnungen">
          <span className="dashStatTop"><span className="dashStatIcon"><Glyph d="M12 3v18M16 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H7" /></span><span className="dashStatLabel">Offene Rechnungen</span></span>
          <strong>{invoiceValue}</strong>
          <small><Glyph d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" /> {invoiceHint}</small>
          <span className="dashStatArrow" aria-hidden="true"><Glyph d="M9 6l6 6-6 6" /></span>
          <Wave />
        </Link>
        <div className="dashStat tone-orange">
          <span className="dashStatTop"><span className="dashStatIcon"><Glyph d="M5 5h14v14H5zM5 9h14M9 3v4M15 3v4" /></span><span className="dashStatLabel">Überfällige Rechnungen</span></span>
          <strong>{invoiceLoading || cloudLoading ? "…" : String(overdueInvoiceCount)}</strong>
          <small className="dashStatWarn">{overdueHint}</small>
          <span className="dashStatLinks">
            <Link href="/mahnungen">Mahnungen öffnen →</Link>
            <Link href="/versand">Versandprotokoll →</Link>
          </span>
          <Link className="dashStatArrow" href="/mahnungen" aria-label="Mahnungen öffnen"><Glyph d="M9 6l6 6-6 6" /></Link>
          <Wave />
        </div>
      </section>

      <section className="panel offerAcceptPanel">
        <div className="panelHead">
          <div className="panelTitleWithIcon">
            <span className="panelGlyph tone-purple" aria-hidden="true"><Glyph d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 1.5V9h4.5M8 13h8M8 17h5" /></span>
            <div>
              <h2>Angenommene Angebote ohne Auftrag</h2>
              <p>Geldpfad: Angebot angenommen → Auftrag anlegen → planen</p>
            </div>
          </div>
          <Link className="textLink" href="/angebote">Zu den Angeboten →</Link>
        </div>
        {offerMsg && <div className="sendSuccess" style={{ marginBottom: 10 }}>{offerMsg}</div>}
        {offerErr && <div className="loginError" style={{ marginBottom: 10 }}>{offerErr}</div>}
        {cloudLoading || offersLoading ? (
          <LoadingState label="Prüfe angenommene Angebote…" />
        ) : pendingOffers.length === 0 ? (
          <div className="dashEmpty">
            <span className="dashEmptyIcon" aria-hidden="true"><Glyph d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 1.5V9h4.5" /></span>
            <strong>Alles angelegt <span>✓</span></strong>
            <p>Keine angenommenen Angebote ohne verknüpften Auftrag.</p>
          </div>
        ) : (
          pendingOffers.map((doc) => {
            const customer = customers.find((c) => Number(c.id) === Number(doc.customer_id));
            return (
              <div className="jobListRow billingGapRow" key={doc.id}>
                <div className="jobTime">{doc.document_number}</div>
                <div>
                  <h3>{doc.title || "Angebot"}</h3>
                  <p>
                    {customer?.name ?? "Kunde"}
                    {doc.total_amount != null ? ` · ${euro(Number(doc.total_amount))}` : ""}
                    {doc.customer_response_at
                      ? ` · ${new Date(doc.customer_response_at).toLocaleString("de-DE")}`
                      : ""}
                  </p>
                </div>
                <div className="billingGapActions">
                  <Badge tone="green">Angenommen</Badge>
                  <Link className="textLink" href="/angebote">
                    Angebot
                  </Link>
                  <button
                    type="button"
                    className="primaryBtn billingGapBtn"
                    disabled={offerBusyId === doc.id}
                    onClick={() => void onCreateJobFromOffer(doc.id)}
                  >
                    {offerBusyId === doc.id ? "…" : "Auftrag aus Angebot"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="panel billingGapPanel">
        <div className="panelHead">
          <div>
            <h2>Erledigte Aufträge ohne Rechnung</h2>
            <p>Abrechnungs-Lücke · nur aktive (nicht stornierte) Rechnungen zählen</p>
          </div>
          <Link className="textLink" href="/auftraege">Zur Auftragsakte →</Link>
        </div>
        {cloudLoading || invoiceLoading ? (
          <LoadingState label="Prüfe erledigte Aufträge…" />
        ) : billingGapJobs.length === 0 ? (
          <EmptyState
            title="Alles abgerechnet"
            hint="Alle erledigten Aufträge haben bereits eine Rechnung (oder es gibt keine erledigten Aufträge)."
          />
        ) : (
          billingGapJobs.map((job) => {
            const customer = customers.find((c) => c.id === job.customerId);
            return (
              <div className="jobListRow billingGapRow" key={job.id}>
                <div className="jobTime">{formatDate(job.date)}</div>
                <div>
                  <h3>{job.title}</h3>
                  <p>
                    {customer?.name ?? "Unbekannter Kunde"}
                    {job.number ? ` · ${job.number}` : ""}
                    {job.time ? ` · ${job.time} Uhr` : ""}
                  </p>
                </div>
                <div className="billingGapActions">
                  <Badge tone="green">Erledigt</Badge>
                  <Link className="textLink" href={`/auftraege?akte=${encodeURIComponent(job.id)}`}>
                    Akte
                  </Link>
                  <button
                    type="button"
                    className="primaryBtn billingGapBtn"
                    disabled={gapBusyId === job.id}
                    onClick={() => void onPrepareGapInvoice(job.id)}
                  >
                    {gapBusyId === job.id ? "…" : "Rechnung vorbereiten"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="grid2">
        <div className="panel">
          <div className="panelHead"><div><h2>Heutige Aufträge</h2><p>{todayLabel}</p></div><Link className="textLink" href="/heute">Heute-Übersicht →</Link></div>
          {todayJobs.length === 0 ? (
            <EmptyState title="Keine Aufträge heute" hint="Heute sind noch keine Aufträge geplant." />
          ) : (
            todayJobs.map((job) => {
              const customer = customers.find((c) => c.id === job.customerId);
              return (
                <Link href={`/auftraege?akte=${encodeURIComponent(job.id)}`} className="jobListRow workerJobLink" key={job.id}>
                  <div className="jobTime">{job.time}</div>
                  <div><h3>{job.title}</h3><p>{customer?.name ?? "Unbekannter Kunde"} · {job.address}</p></div>
                  <Badge tone={job.status === "In Arbeit" ? "orange" : job.status === "Erledigt" ? "green" : "blue"}>{job.status}</Badge>
                </Link>
              );
            })
          )}
        </div>
        <div className="panel">
          <div className="panelHead"><div><h2>Team heute</h2><p>Status der Mitarbeiter</p></div><Link className="textLink" href="/mitarbeiter">Team verwalten →</Link></div>
          {employees.length === 0 ? (
            <EmptyState title="Noch kein Team" hint="Lege Mitarbeiter unter Team / Mitarbeiter an." />
          ) : (
            employees.filter((e) => e.active).slice(0, 6).map((e) => (
              <div className="teamRow" key={e.id}>
                <div className="avatar">{initials(e.name)}</div>
                <div className="teamMeta"><strong title={e.name}>{e.name}</strong><span>{e.role}</span></div>
                <div className={`dot ${e.status === "Im Einsatz" ? "orange" : e.status === "Verfügbar" ? "green" : "gray"}`} />
              </div>
            ))
          )}
        </div>
      </section>
    </main>
    </>
  );
}
