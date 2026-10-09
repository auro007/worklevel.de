"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, LoadingState, Modal, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { useAuth } from "@/context/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { documentSender } from "@/lib/documentSender";
import { readAllRows } from "@/lib/readAllRows";
import {
  createJobFromOffer,
  jobAkteHref,
  jobPlantafelHref,
  jobTechnikerHref,
} from "@/lib/createJobFromOffer";
import { promoteOverdueInvoices } from "@/lib/promoteOverdueInvoices";
import { invoiceRemainder, isInvoiceOverdue, visibleInvoiceStatus } from "@/lib/invoiceStatus";
import { markInvoicePaid, unmarkInvoicePaid } from "@/lib/markInvoicePaid";
import { useConfirm } from "@/components/ConfirmProvider";
import { buildZugferdInvoice } from "@/lib/zugferdInvoice";
import { embedZugferdXml } from "@/lib/zugferdPdf";
import { deNumber, euro, formatDate, reminderLevelLabel } from "@/lib/utils";
import {
  buildOfferLetterPdf,
  emptyOfferLetter,
  isOfferLetter,
  letterItemPrice,
  letterPriceItems,
  parseOfferLetter,
  serializeOfferLetter,
  winterdienstOffer,
  type LetterPrice,
  type OfferLetter,
} from "@/lib/offerLetter";
import { OfferLetterView } from "@/components/OfferLetterView";

type DocType = "offer" | "delivery_note" | "invoice";
type Item = {
  id?: string;
  position: number;
  item_type: "service" | "material" | "text";
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};
type Doc = {
  id: string;
  company_id: string;
  customer_id: number;
  job_id: string | null;
  doc_type: DocType;
  document_number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  valid_until: string | null;
  title: string | null;
  intro_text: string | null;
  notes: string | null;
  vat_rate: number;
  taxation_mode: "standard" | "small_business";
  tax_note: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  sent_at?: string | null;
  last_sent_at?: string | null;
  sent_to_email?: string | null;
  sent_count?: number;
  converted_job_id?: string | null;
  customer_response_at?: string | null;
  customer_response_name?: string | null;
  customer_response_message?: string | null;
  paid_at?: string | null;
  payment_note?: string | null;
  amount_paid?: number | null;
  corrects_document_id?: string | null;
  last_reminder_at?: string | null;
  reminder_count?: number;
  created_at: string;
};
type DocEvent = {
  id: string;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
};
type PublicLink = {
  id: string;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_opened_at: string | null;
};
type DocTemplate = {
  id: string;
  company_id: string;
  doc_type: "offer" | "invoice";
  name: string;
  title: string | null;
  intro: string | null;
  notes: string | null;
  vat_rate: number;
  default_items: Array<{
    item_type?: "service" | "material" | "text";
    description?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
  }> | null;
  active: boolean;
};
type Config = {
  type: DocType;
  title: string;
  subtitle: string;
  singular: string;
  newLabel: string;
  icon: string;
};

const statusOptions: Record<DocType, string[]> = {
  offer: ["Entwurf", "Gesendet", "Änderung angefragt", "Angenommen", "Abgelehnt", "Storniert"],
  delivery_note: ["Entwurf", "Offen", "Unterzeichnet", "Storniert"],
  invoice: ["Entwurf", "Offen", "Teilbezahlt", "Bezahlt", "Überfällig", "Storniert", "Stornorechnung"],
};

function tone(status: string) {
  return status === "Bezahlt" || status === "Angenommen" || status === "Unterzeichnet"
    ? "green"
    : status === "Überfällig" || status === "Abgelehnt" || status === "Storniert" || status === "Stornorechnung"
      ? "red"
      : status === "Teilbezahlt"
        ? "yellow"
      : status === "Änderung angefragt"
        ? "yellow"
        : status === "Entwurf"
          ? "gray"
          : "orange";
}
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function plusDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
const UNIT_OPTIONS = ["Stk.", "Std.", "m", "m²", "kg", "Psch."];
function numericUnit(unit: string) {
  return /^\d+([.,]\d+)?$/.test(unit.trim());
}
function daysOverdue(due: string | null, todayIso: string) {
  if (!due || due >= todayIso) return 0;
  const a = new Date(due + "T12:00:00").getTime();
  const b = new Date(todayIso + "T12:00:00").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}
function eventLabel(type: string) {
  const map: Record<string, string> = {
    created: "Erstellt",
    sent: "Versandt",
    shared: "Geteilt",
    downloaded: "PDF heruntergeladen",
    status_changed: "Status geändert",
    link_created: "Kundenlink erstellt",
    link_revoked: "Kundenlink widerrufen",
    customer_response: "Kundenantwort",
    converted_to_job: "In Auftrag umgewandelt",
    payment_recorded: "Zahlung erfasst",
    reminder_logged: "Mahnung / Erinnerung",
  };
  return map[type] || type;
}

export default function DocumentsManager({ config }: { config: Config }) {
  const ask = useConfirm();
  const { customers, customerSites, jobs, reloadCloud } = useAppData();
  const { company, role } = useCompany();
  const { user } = useAuth();
  const router = useRouter();
  const canConvertOffer = role === "owner" || role === "admin";
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alle");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPdfUrl, setDraftPdfUrl] = useState<string | null>(null);
  const [draftPages, setDraftPages] = useState<string[]>([]);
  const [draftPreviewBusy, setDraftPreviewBusy] = useState(false);
  const [draftPreviewError, setDraftPreviewError] = useState("");
  useEffect(() => () => { if (draftPdfUrl) URL.revokeObjectURL(draftPdfUrl); }, [draftPdfUrl]);
  const [preview, setPreview] = useState<Doc | null>(null);
  const [previewItems, setPreviewItems] = useState<Item[]>([]);
  const [events, setEvents] = useState<DocEvent[]>([]);
  const [activeLink, setActiveLink] = useState<PublicLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkInfo, setLinkInfo] = useState("");
  const [convertHighlight, setConvertHighlight] = useState(false);
  const [convertResult, setConvertResult] = useState<{ id: string; job_number: string; already_existed: boolean } | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const [sendForm, setSendForm] = useState({ to: "", subject: "", message: "" });
  const [senderEmail, setSenderEmail] = useState("");
  useEffect(() => {
    const db = getSupabaseClient(); let cancelled = false;
    setSenderEmail("");
    if (!db || !company || !sendOpen) return;
    documentSender(db, company.id).then(sender => { if (!cancelled) setSenderEmail(sender.email); }).catch(() => { if (!cancelled) setSendError("Inhaber-Adresse konnte nicht geladen werden."); });
    return () => { cancelled = true; };
  }, [company?.id, sendOpen]);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderInfo, setReminderInfo] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [reminderFallback, setReminderFallback] = useState<{ subject: string; body: string; to: string } | null>(null);
  const [pendingDeepDocId, setPendingDeepDocId] = useState<string | null>(null);
  const [pendingRemindDocId, setPendingRemindDocId] = useState<string | null>(null);
  const [reminderForId, setReminderForId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const deepLinkHandled = useMemo(() => ({ current: false }), []);
  const today = isoToday();
  const [form, setForm] = useState({
    customerId: "",
    jobId: "",
    issueDate: today,
    dueDate: "",
    validUntil: "",
    title: "",
    intro: "",
    notes: "",
    vatRate: 19,
    taxationMode: "standard" as "standard" | "small_business",
    status: "Entwurf",
  });
  const [items, setItems] = useState<Item[]>([
    { position: 1, item_type: "service", description: "Leistung", quantity: 1, unit: "Std.", unit_price: 0, line_total: 0 },
  ]);
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [catalog, setCatalog] = useState<Array<{id:string;name:string;sku:string|null;unit:string;sales_price:number}>>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [offerLayout, setOfferLayout] = useState<"positionen" | "vertrag">("positionen");
  const [letter, setLetter] = useState<OfferLetter>(() => emptyOfferLetter());
  const [letterPrices, setLetterPrices] = useState<LetterPrice[]>([]);
  const [letterTouched, setLetterTouched] = useState(false);
  const [letterPages, setLetterPages] = useState<string[]>([]);
  const useLetter = config.type === "offer" && offerLayout === "vertrag";

  useEffect(() => {
    if (!preview || !company || !isOfferLetter(preview.notes)) return;
    let cancelled = false;
    void (async () => {
      try {
        const pdf = await buildPdf(preview, previewItems);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = pdf.output("arraybuffer");
        const rendered = await pdfjs.getDocument({ data: data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array() }).promise;
        const pages: string[] = [];
        try {
          for (let pageNumber = 1; pageNumber <= rendered.numPages; pageNumber += 1) {
            const page = await rendered.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1.35 });
            const canvas = document.createElement("canvas");
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, viewport }).promise;
            pages.push(canvas.toDataURL("image/png"));
            canvas.width = 0;
            canvas.height = 0;
          }
        } finally {
          await rendered.destroy();
        }
        if (!cancelled) setLetterPages(pages);
      } catch {
        if (!cancelled) setLetterPages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // buildPdf is recreated each render and reads the current company and customers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, previewItems, company?.id, customers]);

  useEffect(() => {
    const s = getSupabaseClient();
    if (!s || !company || !open) return;
    let cancelled = false;
    void readAllRows((from, to) => s.from("inventory_materials").select("id,name,sku,unit,sales_price").eq("company_id", company.id).eq("active", true).order("name").order("id").range(from, to)).then(({data,error}) => {
      if (cancelled) return;
      if (error) setError(`Materialkatalog: ${error.message}`);
      else setCatalog(data ?? []);
    });
    return () => { cancelled = true; };
  }, [company?.id, open]);

  function addCatalogMaterial(id: string) {
    const m = catalog.find(x => x.id === id);
    if (!m) return;
    setItems(cur => [...cur, {position:cur.length+1,item_type:"material",description:m.name,quantity:1,unit:m.unit,unit_price:Number(m.sales_price),line_total:Number(m.sales_price)}]);
    setCatalogQuery("");
  }

  useEffect(() => {
    if (!company) return;
    setForm((f) => ({
      ...f,
      vatRate: Number(company.default_vat_rate ?? 19),
      taxationMode: (company.taxation_mode ?? "standard") as "standard" | "small_business",
      dueDate: plusDays(today, Number(company.payment_terms_days ?? 14)),
      validUntil: plusDays(today, 14),
    }));
    loadDocs();
    loadTemplates();
  }, [company?.id, config.type]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const customerQ = params.get("customer");
    const jobQ = params.get("job");
    if (customerQ || jobQ) {
      setForm((f) => ({
        ...f,
        customerId: customerQ || f.customerId,
        jobId: jobQ || f.jobId,
      }));
      if (jobQ) importJob(jobQ);
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers.length, jobs.length, company?.id]);

  function clearDocSearch() {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("doc") && !url.searchParams.has("remind")) return;
    url.searchParams.delete("doc");
    url.searchParams.delete("remind");
    const query = url.searchParams.toString();
    window.history.replaceState(null, "", url.pathname + (query ? `?${query}` : "") + url.hash);
  }

  // Deep link from /mahnungen: ?doc=<id>&remind=1
  useEffect(() => {
    if (typeof window === "undefined" || deepLinkHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const docId = params.get("doc");
    if (!docId) return;
    deepLinkHandled.current = true;
    setPendingDeepDocId(docId);
    if (params.get("remind") === "1") setPendingRemindDocId(docId);
  }, [deepLinkHandled]);

  useEffect(() => {
    if (!pendingDeepDocId || loading || !docs.length) return;
    const doc = docs.find((d) => d.id === pendingDeepDocId);
    setPendingDeepDocId(null);
    if (!doc) return;
    void (async () => {
      await showPreview(doc);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeepDocId, loading, docs]);

  useEffect(() => {
    if (!pendingRemindDocId || !preview || reminderOpen) return;
    if (String(preview.id) !== String(pendingRemindDocId)) return;
    setPendingRemindDocId(null);
    clearDocSearch();
    openReminderDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRemindDocId, preview, reminderOpen]);

  useEffect(() => {
    if (!reminderOpen || !reminderForId || !preview) return;
    if (String(preview.id) !== String(reminderForId)) setReminderOpen(false);
  }, [preview?.id, reminderOpen, reminderForId]);

  useEffect(() => {
    if (!form.customerId && customers[0]) setForm((f) => ({ ...f, customerId: customers[0].id }));
  }, [customers.length]);

  async function loadDocs() {
    const s = getSupabaseClient();
    if (!s || !company) return;
    setLoading(true);
    setError("");
    if (config.type === "invoice") await promoteOverdueInvoices(company.id);
    const { data, error: e } = await s
      .from("documents")
      .select("*")
      .eq("company_id", company.id)
      .eq("doc_type", config.type)
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (e) setError(e.message);
    else setDocs((data ?? []) as Doc[]);
    setLoading(false);
  }

  async function loadTemplates() {
    const s = getSupabaseClient();
    if (!s || !company) return;
    if (config.type !== "offer" && config.type !== "invoice") {
      setTemplates([]);
      return;
    }
    const { data, error: e } = await s
      .from("document_templates")
      .select("*")
      .eq("company_id", company.id)
      .eq("doc_type", config.type)
      .eq("active", true)
      .order("name", { ascending: true });
    if (e) {
      // Table may not exist yet before SQL apply — keep UI usable
      console.warn("document_templates:", e.message);
      setTemplates([]);
    } else {
      setTemplates((data ?? []) as DocTemplate[]);
    }
  }

  function applyWinterdienst() {
    const packed = winterdienstOffer(company?.name || "");
    setForm((current) => ({ ...current, title: packed.title, intro: packed.intro }));
    setLetter(packed.letter);
    setLetterPrices(packed.prices);
    setLetterTouched(true);
    setOfferLayout("vertrag");
  }
  function chooseVertrag() {
    if (!letterTouched) applyWinterdienst();
    else setOfferLayout("vertrag");
  }
  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setForm((f) => ({
      ...f,
      title: t.title ?? f.title,
      intro: t.intro ?? "",
      notes: t.notes ?? "",
      vatRate: Number(t.vat_rate ?? f.vatRate),
    }));
    const raw = Array.isArray(t.default_items) ? t.default_items : [];
    const parsedLetter = parseOfferLetter(t.notes);
    if (parsedLetter) {
      setLetter(parsedLetter);
      setLetterTouched(true);
      setOfferLayout("vertrag");
      setLetterPrices(raw.map((it) => ({ description: it.description || "", price: letterItemPrice(it) })));
      return;
    }
    setOfferLayout("positionen");
    if (raw.length > 0) {
      setItems(
        raw.map((it, i) => {
          const qty = Number(it.quantity ?? 1);
          const price = Number(it.unit_price ?? 0);
          return {
            position: i + 1,
            item_type: (it.item_type as Item["item_type"]) || "service",
            description: it.description || "",
            quantity: qty,
            unit: it.unit || "Stk.",
            unit_price: price,
            line_total: qty * price,
          };
        })
      );
    }
  }

  function lineAmount(value: number) {
    return Number.isFinite(value) ? value : 0;
  }
  function setLine(index: number, patch: Partial<Item>) {
    setItems((cur) =>
      cur.map((x, i) =>
        i === index
          ? {
              ...x,
              ...patch,
              line_total: lineAmount(patch.quantity ?? x.quantity) * lineAmount(patch.unit_price ?? x.unit_price),
            }
          : x
      )
    );
  }
  function addLine() {
    setItems((cur) => [
      ...cur,
      { position: cur.length + 1, item_type: "service", description: "", quantity: 1, unit: "Stk.", unit_price: 0, line_total: 0 },
    ]);
  }
  function removeLine(index: number) {
    setItems((cur) => cur.filter((_, i) => i !== index).map((x, i) => ({ ...x, position: i + 1 })));
  }

  const subtotal = useMemo(() => items.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0) * (Number.isFinite(i.unit_price) ? i.unit_price : 0), 0), [items]);
  const effectiveVatRate = form.taxationMode === "small_business" ? 0 : Number(form.vatRate || 0);
  const vat = (subtotal * effectiveVatRate) / 100;
  const total = subtotal + vat;
  const smallBusinessNote =
    "Steuerbefreiung für Kleinunternehmer nach § 19 Abs. 1 UStG. Es wird keine Umsatzsteuer berechnet.";
  function zugferdInput(doc: Doc, docItems: Item[]) {
    const customer = customers.find((item) => Number(item.id) === Number(doc.customer_id));
    return {
      number: doc.document_number,
      issueDate: doc.issue_date,
      dueDate: doc.due_date,
      smallBusiness: doc.taxation_mode === "small_business",
      vatRate: Number(doc.vat_rate) || 0,
      subtotal: Number(doc.subtotal),
      vatAmount: Number(doc.vat_amount),
      totalAmount: Number(doc.total_amount),
      seller: {
        name: company?.name,
        street: company?.street,
        postalCode: company?.postal_code,
        city: company?.city,
        vatId: company?.vat_id,
        taxNumber: company?.tax_number,
        iban: company?.iban,
        bic: company?.bic,
      },
      buyer: {
        name: customer?.name,
        street: customer?.street,
        postalCode: customer?.postalCode,
        city: customer?.city,
      },
      lines: docItems.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitPrice: Number(item.unit_price) || 0,
        lineTotal: Number(item.line_total),
      })),
    };
  }

  const eInvoice = useMemo(() => {
    if (config.type !== "invoice" || !preview || !company) return null;
    return buildZugferdInvoice(zugferdInput(preview, previewItems));
  }, [config.type, preview, company, customers, previewItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      const c = customers.find((x) => Number(x.id) === Number(d.customer_id));
      const hay = `${d.document_number} ${d.title ?? ""} ${d.status} ${c?.name ?? ""} ${c?.phone ?? ""} ${c?.email ?? ""} ${c?.street ?? ""} ${c?.city ?? ""} ${c?.postalCode ?? ""}`.toLowerCase();
      const hit = !q || hay.includes(q);
      const statusOk = statusFilter === "Alle" || d.status === statusFilter;
      return hit && statusOk;
    });
  }, [docs, customers, query, statusFilter]);

  async function importJob(jobId: string) {
    setForm((f) => ({ ...f, jobId }));
    if (!jobId) return;
    const s = getSupabaseClient();
    if (!s || !company) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    setBusy(true);
    setError("");
    const [tr, mr] = await Promise.all([
      s.from("job_time_entries").select("started_at,ended_at").eq("job_id", jobId),
      s.from("job_materials").select("material_name,quantity,unit,unit_price").eq("job_id", jobId),
    ]);
    if (tr.error || mr.error) {
      setError((tr.error || mr.error)?.message ?? "Auftragsdaten konnten nicht geladen werden");
      setBusy(false);
      return;
    }
    let ms = 0;
    for (const t of tr.data ?? []) {
      if (t.started_at && t.ended_at) ms += new Date(t.ended_at).getTime() - new Date(t.started_at).getTime();
    }
    const hours = Math.round((ms / 3600000) * 100) / 100;
    const imported: Item[] = [];
    const isDelivery = config.type === "delivery_note";
    // Lieferschein: Material zuerst (Packliste). Arbeitszeit nur wenn kein Material.
    for (const m of mr.data ?? []) {
      const qty = Number(m.quantity);
      if (!qty) continue;
      imported.push({
        position: imported.length + 1,
        item_type: "material",
        description: m.material_name,
        quantity: qty,
        unit: m.unit || "Stk.",
        unit_price: Number(m.unit_price ?? 0),
        line_total: qty * Number(m.unit_price ?? 0),
      });
    }
    if (!isDelivery && hours > 0) {
      imported.unshift({
        position: 1,
        item_type: "service",
        description: `Arbeitszeit – ${job.title}`,
        quantity: hours,
        unit: "Std.",
        unit_price: Number(company.hourly_rate ?? 0),
        line_total: hours * Number(company.hourly_rate ?? 0),
      });
      imported.forEach((it, i) => {
        it.position = i + 1;
      });
    } else if (isDelivery && imported.length === 0 && hours > 0) {
      imported.push({
        position: 1,
        item_type: "service",
        description: `Leistung / Nachweis – ${job.title}`,
        quantity: hours,
        unit: "Std.",
        unit_price: Number(company.hourly_rate ?? 0),
        line_total: hours * Number(company.hourly_rate ?? 0),
      });
    }
    if (imported.length === 0) {
      imported.push({
        position: 1,
        item_type: isDelivery ? "text" : "service",
        description: isDelivery
          ? `Kein Material gebucht — Positionen ergänzen (${job.title})`
          : job.title,
        quantity: isDelivery ? 1 : Number(job.estimatedHours || 1),
        unit: isDelivery ? "Stk." : "Std.",
        unit_price: isDelivery ? 0 : Number(company.hourly_rate ?? 0),
        line_total: isDelivery ? 0 : Number(job.estimatedHours || 1) * Number(company.hourly_rate ?? 0),
      });
    }
    setItems(imported);
    setForm((f) => ({
      ...f,
      customerId: job.customerId,
      title: job.title,
      intro: isDelivery
        ? `Materialnachweis aus Auftrag ${job.number}`
        : f.intro,
    }));
    setBusy(false);
  }

  async function previewDraft() {
    setDraftPreviewError("");
    if (!company || !form.customerId) { setDraftPreviewError("Bitte zuerst einen Kunden auswählen."); return; }
    if (!useLetter && !items.length) { setDraftPreviewError("Bitte mindestens eine Position hinzufügen."); return; }
    if (useLetter && !form.intro.trim() && !letter.sections.some((section) => section.heading.trim() || section.body.trim())) {
      setDraftPreviewError("Bitte einen Text oder Abschnitt eintragen.");
      return;
    }
    setDraftPreviewBusy(true);
    try {
      const draftItems = useLetter
        ? letterPriceItems(letterPrices)
        : items.map((item, index) => ({ ...item, position: index + 1,
        description: item.description || "Position", unit: item.unit || "Stk.",
        line_total: Math.round(Number(item.quantity) * Number(item.unit_price) * 100) / 100 }));
      if (draftItems.some(item => !Number.isFinite(item.line_total))) throw new Error("Bitte Mengen und Preise prüfen.");
      const draftSubtotal = draftItems.reduce((sum, item) => sum + item.line_total, 0);
      const draftVat = Math.round(draftSubtotal * effectiveVatRate) / 100;
      const doc: Doc = {
        id: "", company_id: company.id, customer_id: Number(form.customerId), job_id: form.jobId || null,
        doc_type: config.type, document_number: "ENTWURF", status: "Entwurf",
        issue_date: form.issueDate, due_date: config.type === "invoice" ? form.dueDate || null : null,
        valid_until: config.type === "offer" ? form.validUntil || null : null,
        title: form.title || config.singular, intro_text: form.intro || null,
        notes: useLetter ? serializeOfferLetter(letter) : form.notes || null,
        vat_rate: effectiveVatRate, taxation_mode: form.taxationMode,
        tax_note: form.taxationMode === "small_business" ? smallBusinessNote : null,
        subtotal: draftSubtotal, vat_amount: draftVat, total_amount: draftSubtotal + draftVat,
        created_at: new Date().toISOString(),
      };
      const pdf = await buildPdf(doc, draftItems);
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const rendered = await pdfjs.getDocument({ data: new Uint8Array(pdf.output("arraybuffer")) }).promise;
      const pages: string[] = [];
      try {
        for (let pageNumber = 1; pageNumber <= rendered.numPages; pageNumber++) {
          const page = await rendered.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport }).promise;
          pages.push(canvas.toDataURL("image/png"));
          canvas.width = 0; canvas.height = 0;
        }
      } finally { await rendered.destroy(); }
      setDraftPages(pages);
      setDraftPdfUrl(URL.createObjectURL(pdf.output("blob")));
    } catch (e) { setDraftPreviewError(e instanceof Error ? e.message : "Vorschau konnte nicht erstellt werden."); }
    finally { setDraftPreviewBusy(false); }
  }

  function documentGuard(): string | null {
    if (config.type === "invoice" && form.dueDate && form.issueDate && form.dueDate < form.issueDate) {
      return "Das Fälligkeitsdatum muss am oder nach dem Rechnungsdatum liegen.";
    }
    if (!useLetter && items.some((item) => numericUnit(item.unit || ""))) {
      return "Die Einheit muss ein Text sein, zum Beispiel Stk., Std. oder m. Eine Zahl ist keine Einheit.";
    }
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const s = getSupabaseClient();
    if (!s || !company || !user || !form.customerId) return;
    if (!useLetter && items.length === 0) { setError("Bitte mindestens eine Position hinzufügen."); return; }
    if (useLetter && !form.intro.trim() && !letter.sections.some((section) => section.heading.trim() || section.body.trim())) {
      setError("Bitte einen Text oder Abschnitt eintragen.");
      return;
    }
    const guard = documentGuard();
    if (guard) { setError(guard); return; }
    if (config.type === "invoice" && total <= 0 && !(await ask("Der Rechnungsbetrag ist 0,00 €. Trotzdem speichern? Eine 0-€-Rechnung wird nicht überfällig und nicht gemahnt."))) return;
    setBusy(true);
    setError("");
    const due = config.type === "invoice" ? form.dueDate : null;
    if (editingId) {
      const sourceItems = useLetter ? letterPriceItems(letterPrices) : items;
      const notes = useLetter ? serializeOfferLetter(letter) : form.notes || null;
      const { error: upErr } = await s.from("documents").update({
        customer_id: Number(form.customerId),
        job_id: form.jobId || null,
        issue_date: form.issueDate,
        due_date: config.type === "invoice" ? due || null : null,
        valid_until: config.type === "offer" ? form.validUntil || null : null,
        title: form.title || config.singular,
        intro_text: form.intro || null,
        notes,
        vat_rate: effectiveVatRate,
        taxation_mode: form.taxationMode,
        tax_note: form.taxationMode === "small_business" ? smallBusinessNote : null,
        updated_at: new Date().toISOString(),
      }).eq("id", editingId).eq("status", "Entwurf");
      if (upErr) { setError(upErr.message); setBusy(false); return; }
      const removed = await s.from("document_items").delete().eq("document_id", editingId);
      if (removed.error) { setError(removed.error.message); setBusy(false); return; }
      const payload = sourceItems.map((it, i) => ({
        document_id: editingId,
        company_id: company.id,
        position: i + 1,
        item_type: it.item_type,
        description: it.description || "Position",
        quantity: Number(it.quantity) || 0,
        unit: it.unit || "Stk.",
        unit_price: Number(it.unit_price) || 0,
        line_total: Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100,
      }));
      const ins = payload.length ? await s.from("document_items").insert(payload) : { error: null };
      if (ins.error) { setError(ins.error.message); setBusy(false); return; }
      await s.rpc("recalculate_document", { p_document: editingId });
      setEditingId(null);
      setOpen(false);
      await loadDocs();
      setBusy(false);
      return;
    }
    const valid = config.type === "offer" ? form.validUntil : null;
    const notes = useLetter ? serializeOfferLetter(letter) : form.notes || null;
    const { data, error: e1 } = await s.rpc("create_business_document", {
      p_company: company.id,
      p_customer: Number(form.customerId),
      p_job: form.jobId || null,
      p_type: config.type,
      p_issue_date: form.issueDate,
      p_due_date: due || null,
      p_valid_until: valid || null,
      p_title: form.title || config.singular,
      p_intro: form.intro || null,
      p_notes: notes,
      p_vat_rate: effectiveVatRate,
    });
    if (e1) {
      setError(e1.message);
      setBusy(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) {
      setError("Dokument konnte nicht erstellt werden.");
      setBusy(false);
      return;
    }
    const sourceItems = useLetter ? letterPriceItems(letterPrices) : items;
    const payload = sourceItems.map((it, i) => ({
      document_id: row.id,
      company_id: company.id,
      position: i + 1,
      item_type: it.item_type,
      description: it.description || "Position",
      quantity: Number(it.quantity) || 0,
      unit: it.unit || "Stk.",
      unit_price: Number(it.unit_price) || 0,
      line_total: Math.round((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) * 100) / 100,
    }));
    const ins = payload.length ? await s.from("document_items").insert(payload) : { error: null };
    if (ins.error) {
      await s.from("documents").delete().eq("id", row.id);
      setError(ins.error.message);
      setBusy(false);
      return;
    }
    await s
      .from("documents")
      .update({
        taxation_mode: form.taxationMode,
        tax_note: form.taxationMode === "small_business" ? smallBusinessNote : null,
        vat_rate: effectiveVatRate,
      })
      .eq("id", row.id);
    await s.rpc("recalculate_document", { p_document: row.id });
    await s.rpc("log_document_event", { p_document: row.id, p_event_type: "created", p_details: { doc_type: config.type } });
    if (form.status !== "Entwurf") await s.from("documents").update({ status: form.status }).eq("id", row.id);
    setOpen(false);
    await loadDocs();
    setBusy(false);
  }

  async function issueCreditNote(current: Doc) {
    const s = getSupabaseClient();
    if (!s || !company) return;
    const existing = await s.from("documents").select("id,document_number").eq("corrects_document_id", current.id).limit(1);
    if (existing.error) { setError(existing.error.message); return; }
    let creditId = existing.data?.[0]?.id as string | undefined;
    let creditNumber = existing.data?.[0]?.document_number as string | undefined;
    if (!creditId) {
      const { data: sourceItems, error: itemError } = await s.from("document_items").select("*").eq("document_id", current.id).order("position");
      if (itemError) { setError(itemError.message); return; }
      const { data, error: createError } = await s.rpc("create_business_document", {
        p_company: company.id,
        p_customer: Number(current.customer_id),
        p_job: current.job_id,
        p_type: "invoice",
        p_issue_date: isoToday(),
        p_due_date: null,
        p_valid_until: null,
        p_title: `Stornorechnung zu ${current.document_number}`,
        p_intro: null,
        p_notes: `Stornorechnung zu ${current.document_number}`,
        p_vat_rate: Number(current.vat_rate) || 19,
      });
      if (createError) { setError(createError.message); return; }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.id) { setError("Stornorechnung konnte nicht erstellt werden."); return; }
      creditId = row.id;
      creditNumber = row.document_number;
      const payload = ((sourceItems ?? []) as Item[]).map((it, index) => {
        const quantity = -Math.abs(Number(it.quantity) || 0);
        const price = Number(it.unit_price) || 0;
        return {
          document_id: creditId,
          company_id: company.id,
          position: index + 1,
          item_type: it.item_type || "service",
          description: it.description || "Position",
          quantity,
          unit: it.unit || "Stk.",
          unit_price: price,
          line_total: Math.round(quantity * price * 100) / 100,
        };
      });
      if (payload.length) {
        const inserted = await s.from("document_items").insert(payload);
        if (inserted.error) { setError(inserted.error.message); return; }
      }
      const updated = await s.from("documents").update({
        status: "Stornorechnung",
        corrects_document_id: current.id,
        taxation_mode: current.taxation_mode,
        tax_note: current.tax_note,
        vat_rate: current.vat_rate,
        title: `Stornorechnung zu ${current.document_number}`,
        updated_at: new Date().toISOString(),
      }).eq("id", creditId);
      if (updated.error) { setError(updated.error.message); return; }
      await s.rpc("recalculate_document", { p_document: creditId });
      await s.rpc("log_document_event", {
        p_document: creditId,
        p_event_type: "created",
        p_details: { doc_type: "invoice", corrects: current.document_number },
      });
    }
    const storno = await s.from("documents").update({ status: "Storniert", updated_at: new Date().toISOString() }).eq("id", current.id);
    if (storno.error) { setError(storno.error.message); return; }
    await s.rpc("log_document_event", {
      p_document: current.id,
      p_event_type: "status_changed",
      p_details: { status: "Storniert", credit_note: creditNumber || creditId },
    });
    await loadDocs();
  }

  async function changeStatus(id: string, status: string) {
    const s = getSupabaseClient();
    if (!s) return;
    const current = docs.find((doc) => doc.id === id);
    const previous = current
      ? config.type === "invoice"
        ? visibleInvoiceStatus(current.status, current.paid_at, current.amount_paid, current.total_amount)
        : current.status
      : "";
    if (previous === status) return;
    if (config.type === "invoice" && status === "Teilbezahlt") {
      setError("Eine Teilzahlung buchen Sie in der Vorschau unter Zahlung.");
      return;
    }
    if (config.type === "invoice" && status === "Stornorechnung") {
      setError("Eine Stornorechnung entsteht, wenn Sie die Rechnung auf Storniert setzen.");
      return;
    }
    if (current?.status === "Stornorechnung") {
      setError("Eine Stornorechnung bleibt eine Stornorechnung.");
      return;
    }
    if (config.type === "invoice" && previous === "Bezahlt" && status !== "Bezahlt" && status !== "Storniert") {
      setError("Die Rechnung ist bezahlt. Öffnen Sie sie und wählen Sie „Zahlung zurücknehmen“.");
      return;
    }
    if (config.type === "invoice" && status === "Überfällig" && invoiceRemainder(current?.total_amount, current?.amount_paid) <= 0) {
      setError("Eine Rechnung ohne offenen Betrag kann nicht überfällig werden.");
      return;
    }
    if (status === "Storniert") {
      const number = current?.document_number || "Dieses Dokument";
      if (config.type === "invoice" && current && current.status !== "Entwurf") {
        const ok = await ask(`${number} stornieren? Es entsteht eine Stornorechnung mit eigener Nummer. Die ursprüngliche Nummer bleibt vergeben.`, "Stornieren");
        if (!ok) return;
        setBusy(true);
        try { await issueCreditNote(current); }
        finally { setBusy(false); }
        return;
      }
      const ok = await ask(`${number} stornieren? Die Nummer bleibt vergeben.`, "Stornieren");
      if (!ok) return;
    }
    if (config.type === "invoice" && status === "Bezahlt") {
      const ok = await ask(`${current?.document_number || "Diese Rechnung"} als bezahlt markieren?`, "Als bezahlt");
      if (!ok) return;
      try {
        await markInvoicePaid(id, "Status auf Bezahlt gesetzt");
        await loadDocs();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Zahlung konnte nicht gespeichert werden.");
      }
      return;
    }
    const { error: e } = await s.from("documents").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (e) setError(e.message);
    else {
      await s.rpc("log_document_event", { p_document: id, p_event_type: "status_changed", p_details: { status } });
      await loadDocs();
      if (config.type === "offer" && status === "Angenommen") {
        const { data: fresh } = await s.from("documents").select("*").eq("id", id).maybeSingle();
        if (fresh) {
          const next = fresh as Doc;
          setConvertHighlight(!next.converted_job_id);
          setConvertResult(null);
          setLinkInfo(
            next.converted_job_id
              ? "Status Angenommen — Auftrag ist bereits verknüpft."
              : "Status Angenommen — bitte Auftrag aus Angebot anlegen."
          );
          await showPreview(next);
        }
      }
    }
  }

  async function loadPreviewExtras(doc: Doc) {
    const s = getSupabaseClient();
    if (!s) return;
    const [ev, links] = await Promise.all([
      s.from("document_events").select("id,event_type,details,created_at").eq("document_id", doc.id).order("created_at", { ascending: false }).limit(20),
      config.type === "offer"
        ? s
            .from("offer_public_links")
            .select("id,token,expires_at,revoked_at,created_at,last_opened_at")
            .eq("document_id", doc.id)
            .is("revoked_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (!ev.error) setEvents((ev.data ?? []) as DocEvent[]);
    else setEvents([]);
    if (links && !links.error && links.data && links.data[0]) setActiveLink(links.data[0] as PublicLink);
    else setActiveLink(null);
  }

  async function showPreview(doc: Doc) {
    const s = getSupabaseClient();
    if (!s) return;
    const { data, error: e } = await s.from("document_items").select("*").eq("document_id", doc.id).order("position");
    if (e) {
      setError(e.message);
      return;
    }
    setPreviewItems((data ?? []) as Item[]);
    setLetterPages([]);
    setPreview(doc);
    setLinkInfo("");
    await loadPreviewExtras(doc);
  }

  function defaultEmailText(doc: Doc) {
    const hello = "Guten Tag,";
    if (doc.doc_type === "offer")
      return `${hello}\n\nanbei erhalten Sie unser Angebot ${doc.document_number}. Bitte prüfen Sie das Angebot in Ruhe. Bei Fragen oder Änderungswünschen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\n${company?.name ?? ""}`;
    if (doc.doc_type === "invoice")
      return `${hello}\n\nanbei erhalten Sie unsere Rechnung ${doc.document_number}. Vielen Dank für Ihren Auftrag.\n\nMit freundlichen Grüßen\n${company?.name ?? ""}`;
    return `${hello}\n\nanbei erhalten Sie den Lieferschein ${doc.document_number}.\n\nMit freundlichen Grüßen\n${company?.name ?? ""}`;
  }
  function defaultSubject(doc: Doc) {
    return `${config.singular} ${doc.document_number} – ${company?.name ?? "WORKLEVEL"}`;
  }

  async function buildPdf(doc: Doc, docItems: Item[]) {
    if (!company) throw new Error("Firmendaten fehlen.");
    const customer = customers.find((c) => Number(c.id) === Number(doc.customer_id));
    const parsedLetter = doc.doc_type === "offer" ? parseOfferLetter(doc.notes) : null;
    if (parsedLetter) {
      return await buildOfferLetterPdf({
        documentNumber: doc.document_number,
        issueDateLabel: doc.issue_date ? formatDate(doc.issue_date) : "",
        title: doc.title || "Angebot",
        intro: doc.intro_text || "",
        letter: parsedLetter,
        prices: docItems.map((item) => ({ description: item.description || "", price: letterItemPrice(item) })),
        contractor: {
          name: company.name || "",
          street: company.street,
          postalCode: company.postal_code,
          city: company.city,
          phone: company.phone,
          email: company.email,
        },
        customer: {
          name: customer?.name || "",
          street: customer?.street,
          postalCode: customer?.postalCode,
          city: customer?.city,
          phone: customer?.phone,
          email: customer?.email,
        },
      }) as any;
    }
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = 210;
    const pageH = 297;
    const left = 18;
    const right = pageW - 18;
    const contentW = right - left;
    const accent: [number, number, number] = [255, 106, 0];
    const muted: [number, number, number] = [90, 96, 104];
    const ink: [number, number, number] = [22, 24, 28];
    const lineGray: [number, number, number] = [210, 214, 220];
    const headerBg: [number, number, number] = [245, 246, 248];

    const recipientLabel =
      doc.doc_type === "invoice" ? "Rechnungsempfänger" : doc.doc_type === "offer" ? "Angebotsempfänger" : "Empfänger";

    function drawFooter(pageNum: number, pageCount: number) {
      const fy = pageH - 14;
      pdf.setDrawColor(...lineGray);
      pdf.setLineWidth(0.3);
      pdf.line(left, fy - 4, right, fy - 4);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(...muted);
      const bits = [
        company!.name || "WORKLEVEL",
        company!.iban ? `IBAN ${company!.iban}` : null,
        company!.bic ? `BIC ${company!.bic}` : null,
        company!.tax_number ? `St.-Nr. ${company!.tax_number}` : null,
        company!.vat_id ? `USt-IdNr. ${company!.vat_id}` : null,
      ].filter(Boolean) as string[];
      const footerLine = bits.join("  ·  ");
      if (footerLine) {
        const wrapped = pdf.splitTextToSize(footerLine, contentW - 28);
        pdf.text(wrapped[0], left, fy);
      }
      pdf.text(`Seite ${pageNum} / ${pageCount}`, right, fy, { align: "right" });
      pdf.setTextColor(...ink);
    }

    // —— Header: company left, document meta right ——
    let y = 18;
    pdf.setTextColor(...ink);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(company.name || "WORKLEVEL", left, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...muted);
    const companyLines = [
      company.owner_name ? `Inhaber: ${company.owner_name}` : null,
      company.street || null,
      [company.postal_code, company.city].filter(Boolean).join(" ") || null,
      company.phone ? `Tel. ${company.phone}` : null,
      company.email || null,
    ].filter(Boolean) as string[];
    companyLines.forEach((line) => {
      pdf.text(line, left, y);
      y += 3.8;
    });
    const headerBottom = y;

    // Document type block (right)
    pdf.setTextColor(...accent);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(config.singular, right, 18, { align: "right" });
    pdf.setTextColor(...ink);
    pdf.setFontSize(11);
    pdf.text(doc.document_number, right, 25, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...muted);
    let metaY = 31;
    pdf.text(`Datum: ${formatDate(doc.issue_date)}`, right, metaY, { align: "right" });
    metaY += 4.5;
    if (doc.doc_type === "invoice" && doc.due_date) {
      pdf.text(`Fällig am: ${formatDate(doc.due_date)}`, right, metaY, { align: "right" });
      metaY += 4.5;
    }
    if (doc.doc_type === "offer" && doc.valid_until) {
      pdf.text(`Gültig bis: ${formatDate(doc.valid_until)}`, right, metaY, { align: "right" });
      metaY += 4.5;
    }
    pdf.setTextColor(...ink);

    // Accent bar
    y = Math.max(headerBottom, metaY) + 4;
    pdf.setFillColor(...accent);
    pdf.rect(left, y, contentW, 0.7, "F");
    y += 8;

    // Absenderzeile (window envelope style)
    const absender = [company.name, company.street, [company.postal_code, company.city].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(" · ");
    if (absender) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      pdf.setTextColor(...muted);
      pdf.text(absender, left, y);
      pdf.setDrawColor(...lineGray);
      pdf.setLineWidth(0.2);
      pdf.line(left, y + 1.2, left + Math.min(95, pdf.getTextWidth(absender) + 2), y + 1.2);
      y += 6;
      pdf.setTextColor(...ink);
    }

    // Customer block
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text(recipientLabel.toUpperCase(), left, y);
    y += 4.5;
    pdf.setTextColor(...ink);
    pdf.setFontSize(11);
    const custLines = [
      customer?.name,
      customer?.contact && customer.contact !== customer.name ? customer.contact : null,
      customer?.street,
      [customer?.postalCode, customer?.city].filter(Boolean).join(" "),
    ].filter(Boolean) as string[];
    custLines.forEach((line, idx) => {
      if (idx === 0) pdf.setFont("helvetica", "bold");
      else pdf.setFont("helvetica", "normal");
      pdf.setFontSize(idx === 0 ? 11 : 9.5);
      pdf.text(String(line), left, y);
      y += idx === 0 ? 5 : 4.2;
    });

    const linkedJob = doc.job_id ? jobs.find((j) => j.id === doc.job_id) : undefined;
    const site = linkedJob?.customerSiteId
      ? customerSites.find((s) => s.id === linkedJob.customerSiteId)
      : undefined;
    if (site) {
      y += 3;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(...muted);
      pdf.text("EINSATZORT", left, y);
      y += 4.5;
      pdf.setTextColor(...ink);
      const siteLines = [
        site.name,
        site.street || null,
        [site.postalCode, site.city].filter(Boolean).join(" ") || null,
        site.tenantName ? `Mieter: ${site.tenantName}` : null,
      ].filter(Boolean) as string[];
      siteLines.forEach((line, idx) => {
        if (idx === 0) pdf.setFont("helvetica", "bold");
        else pdf.setFont("helvetica", "normal");
        pdf.setFontSize(idx === 0 ? 10.5 : 9);
        pdf.text(String(line), left, y);
        y += idx === 0 ? 4.5 : 4;
      });
    }
    y += 6;

    // Title + intro
    if (doc.title) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(...ink);
      const titleLines = pdf.splitTextToSize(doc.title, contentW);
      pdf.text(titleLines, left, y);
      y += titleLines.length * 5 + 2;
    }
    if (doc.intro_text) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      const introLines = pdf.splitTextToSize(doc.intro_text, contentW);
      pdf.text(introLines, left, y);
      y += introLines.length * 4.2 + 5;
    }

    // Table header
    const colPos = left;
    const colDesc = left + 10;
    const colTotal = right;
    const colPrice = right - 28;
    const colUnit = right - 62;
    const colQty = right - 74;
    const descWidth = Math.max(40, colQty - colDesc - 8);
    const rowH = 7;
    const ensureSpace = (need: number) => {
      if (y + need > pageH - 28) {
        pdf.addPage();
        y = 18;
      }
    };
    ensureSpace(20);
    pdf.setFillColor(...headerBg);
    pdf.rect(left, y - 4.5, contentW, rowH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...muted);
    pdf.text("Pos.", colPos, y);
    pdf.text("Beschreibung", colDesc, y);
    pdf.text("Menge", colQty, y, { align: "right" });
    pdf.text("Einheit", colUnit, y);
    pdf.text("Einzelpreis", colPrice, y, { align: "right" });
    pdf.text("Gesamt", colTotal, y, { align: "right" });
    y += 3;
    pdf.setDrawColor(...lineGray);
    pdf.setLineWidth(0.35);
    pdf.line(left, y, right, y);
    y += 5;
    pdf.setTextColor(...ink);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);

    docItems.forEach((it, i) => {
      const descLines = pdf.splitTextToSize(it.description || "—", descWidth);
      // getLineHeight() is in points. Convert with the same millimetre scale as the glyphs
      // so a wrapped description and the rule under it stay on one grid.
      const mmPerPoint = pdf.getTextDimensions("0").h / pdf.getFontSize();
      const lineStep = pdf.getLineHeight() * mmPerPoint;
      const textSpan = (descLines.length - 1) * lineStep;
      // The rule used to sit 2mm above the next baseline, inside that row's letters.
      // Keep it below this row's descenders and clear of the next row's caps.
      const lineY = y + textSpan + 2.4;
      const nextY = lineY + 4.6;
      ensureSpace(nextY - y + 2);
      pdf.text(String(i + 1), colPos, y);
      pdf.text(descLines, colDesc, y);
      pdf.text(Number(it.quantity).toLocaleString("de-DE"), colQty, y, { align: "right" });
      pdf.text(it.unit || "", colUnit, y);
      pdf.text(euro(Number(it.unit_price)), colPrice, y, { align: "right" });
      pdf.text(euro(Number(it.line_total)), colTotal, y, { align: "right" });
      pdf.setDrawColor(...lineGray);
      pdf.setLineWidth(0.2);
      pdf.line(left, lineY, right, lineY);
      y = nextY;
    });

    y += 4;
    ensureSpace(40);

    // Totals box
    const boxX = right - 78;
    const boxW = 78;
    pdf.setDrawColor(...lineGray);
    pdf.setLineWidth(0.35);
    pdf.line(boxX, y, right, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text("Zwischensumme (netto)", boxX, y);
    pdf.text(euro(Number(doc.subtotal)), right, y, { align: "right" });
    y += 5.5;
    if (doc.taxation_mode === "small_business") {
      pdf.setTextColor(...muted);
      pdf.text("Umsatzsteuer", boxX, y);
      pdf.text("entfällt", right, y, { align: "right" });
      pdf.setTextColor(...ink);
    } else {
      pdf.text(`MwSt. ${Number(doc.vat_rate).toLocaleString("de-DE")} %`, boxX, y);
      pdf.text(euro(Number(doc.vat_amount)), right, y, { align: "right" });
    }
    y += 3;
    pdf.setDrawColor(...ink);
    pdf.setLineWidth(0.5);
    pdf.line(boxX, y, right, y);
    y += 6;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Gesamtbetrag", boxX, y);
    pdf.text(euro(Number(doc.total_amount)), right, y, { align: "right" });
    y += 10;

    // Notes / Kleinunternehmer / payment
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...ink);

    if (doc.notes) {
      ensureSpace(16);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(...muted);
      pdf.text("Hinweise", left, y);
      y += 4;
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...ink);
      pdf.setFontSize(8.5);
      const noteLines = pdf.splitTextToSize(doc.notes, contentW);
      ensureSpace(noteLines.length * 3.8 + 4);
      pdf.text(noteLines, left, y);
      y += noteLines.length * 3.8 + 4;
    }

    if (doc.taxation_mode === "small_business") {
      ensureSpace(18);
      const note = doc.tax_note || smallBusinessNote;
      const noteLines = pdf.splitTextToSize(note, contentW - 6);
      const boxH = noteLines.length * 3.8 + 6;
      pdf.setFillColor(255, 248, 240);
      pdf.setDrawColor(...accent);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(left, y - 3, contentW, boxH, 1.5, 1.5, "FD");
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(...ink);
      pdf.text(noteLines, left + 3, y + 1);
      y += boxH + 4;
    }

    if (doc.doc_type === "invoice" && company.iban) {
      ensureSpace(16);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(...muted);
      pdf.text("Zahlungsinformationen", left, y);
      y += 4;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...ink);
      const payBits = [
        company.bank_name ? `Bank: ${company.bank_name}` : null,
        `IBAN: ${company.iban}`,
        company.bic ? `BIC: ${company.bic}` : null,
        doc.due_date ? `Bitte überweisen Sie den Betrag bis zum ${formatDate(doc.due_date)}.` : null,
      ].filter(Boolean) as string[];
      payBits.forEach((line) => {
        pdf.text(line, left, y);
        y += 3.8;
      });
      y += 2;
    }

    if (company.document_footer) {
      ensureSpace(12);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(...muted);
      const footLines = pdf.splitTextToSize(company.document_footer, contentW);
      pdf.text(footLines, left, y);
      y += footLines.length * 3.6 + 3;
    }

    const pageCount = pdf.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      pdf.setPage(p);
      drawFooter(p, pageCount);
    }
    return pdf;
  }

  async function documentFile(doc: Doc, docItems: Item[]) {
    const pdf = await buildPdf(doc, docItems);
    const raw = new Uint8Array(pdf.output("arraybuffer"));
    if (doc.doc_type !== "invoice" || !company) return raw;
    const invoice = buildZugferdInvoice(zugferdInput(doc, docItems));
    if (!invoice.ok) return raw;
    try {
      return await embedZugferdXml(raw, invoice.xml);
    } catch {
      return raw;
    }
  }

  function saveBytes(bytes: Uint8Array, filename: string, type: string) {
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([copy], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return blob;
  }

  function bytesToBase64(bytes: Uint8Array) {
    let binary = "";
    const size = 0x8000;
    for (let index = 0; index < bytes.length; index += size) {
      binary += String.fromCharCode(...bytes.subarray(index, index + size));
    }
    return btoa(binary);
  }

  async function logEvent(eventType: "shared" | "downloaded" | "status_changed" | "sent", details: Record<string, unknown> = {}) {
    if (!preview) return;
    const s = getSupabaseClient();
    if (!s) return;
    await s.rpc("log_document_event", { p_document: preview.id, p_event_type: eventType, p_details: details });
    await loadPreviewExtras(preview);
  }

  async function downloadPdf() {
    if (!preview) return;
    const bytes = await documentFile(preview, previewItems);
    saveBytes(bytes, `${preview.document_number}.pdf`, "application/pdf");
    await logEvent("downloaded", preview.doc_type === "invoice" ? { einvoice: eInvoice?.ok ? "zugferd" : "pdf" } : {});
  }

  function downloadEInvoiceXml() {
    if (!preview || !eInvoice?.ok) return;
    saveBytes(new TextEncoder().encode(eInvoice.xml), `${preview.document_number}-zugferd.xml`, "text/xml");
  }

  async function sharePdf() {
    if (!preview) return;
    setSendError("");
    try {
      const bytes = await documentFile(preview, previewItems);
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const file = new File([copy], `${preview.document_number}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await navigator.share({ title: defaultSubject(preview), text: defaultEmailText(preview), files: [file] });
        await logEvent("shared", { method: "web-share" });
      } else {
        saveBytes(bytes, `${preview.document_number}.pdf`, "application/pdf");
        setSendError("Direktes Teilen wird von diesem Browser nicht unterstützt. Die PDF wurde heruntergeladen.");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setSendError(e instanceof Error ? e.message : "Teilen fehlgeschlagen.");
    }
  }

  function openSendDialog() {
    if (!preview) return;
    const customer = customers.find((c) => Number(c.id) === Number(preview.customer_id));
    setSendForm({ to: customer?.email ?? "", subject: defaultSubject(preview), message: defaultEmailText(preview) });
    setSendError("");
    setSendSuccess("");
    setSendOpen(true);
  }

  async function prepareEmailFallback() {
    if (!preview) return;
    const bytes = await documentFile(preview, previewItems);
    saveBytes(bytes, `${preview.document_number}.pdf`, "application/pdf");
    const mailto = `mailto:${encodeURIComponent(sendForm.to)}?subject=${encodeURIComponent(sendForm.subject)}&body=${encodeURIComponent(sendForm.message + "\n\nHinweis: Bitte die heruntergeladene PDF " + preview.document_number + ".pdf anhängen.")}`;
    window.location.href = mailto;
    await logEvent("shared", { method: "mailto" });
  }

  async function sendEmail() {
    if (!preview || !company || !sendForm.to) return;
    setSendBusy(true);
    setSendError("");
    setSendSuccess("");
    try {
      const bytes = await documentFile(preview, previewItems);
      const attachmentBase64 = bytesToBase64(bytes);
      const s = getSupabaseClient();
      if (!s) throw new Error("Supabase ist nicht verfügbar.");
      const { data: sessionData } = await s.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden.");
      const res = await fetch("/api/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          documentId: preview.id,
          to: sendForm.to,
          subject: sendForm.subject,
          text: sendForm.message,
          filename: `${preview.document_number}.pdf`,
          attachmentBase64,
          fromName: company.name,
          replyTo: company.email || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || "E-Mail konnte nicht gesendet werden.");
      const providerId = result?.id ? String(result.id) : null;
      const { error: e } = await s.rpc("mark_document_sent", { p_document: preview.id, p_email: sendForm.to });
      if (e) setSendError("E-Mail wurde versendet, aber der Versandstatus konnte nicht gespeichert werden. Bitte nicht erneut senden.");
      if (providerId) {
        const { data: ev } = await s
          .from("document_events")
          .select("id,details")
          .eq("document_id", preview.id)
          .eq("event_type", "sent")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ev?.id) {
          await s.from("document_events").update({
            details: { ...(ev.details || {}), email: sendForm.to, method: result.provider || "email", provider_id: providerId },
          }).eq("id", ev.id);
        }
      }
      setSendSuccess(
        providerId
          ? `An den Mailserver für ${sendForm.to} übergeben (ID: ${providerId}).`
          : `Erfolgreich an ${sendForm.to} gesendet. Eintrag im Versandprotokoll.`
      );
      await loadDocs();
      setPreview((p) =>
        p
          ? {
              ...p,
              status:
                p.doc_type === "offer" && p.status === "Entwurf"
                  ? "Gesendet"
                  : p.doc_type === "invoice" && p.status === "Entwurf"
                    ? "Offen"
                    : p.status,
              sent_to_email: sendForm.to,
              last_sent_at: new Date().toISOString(),
              sent_count: Number(p.sent_count || 0) + 1,
            }
          : p
      );
      if (preview) await loadPreviewExtras(preview);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "E-Mail-Versand fehlgeschlagen.");
    } finally {
      setSendBusy(false);
    }
  }

  async function createCustomerLink() {
    if (!preview) return;
    const s = getSupabaseClient();
    if (!s) return;
    setLinkBusy(true);
    setLinkInfo("");
    setError("");
    const { data, error: e } = await s.rpc("create_offer_public_link", { p_document: preview.id, p_days: 30 });
    if (e) {
      setError(e.message + " — Bitte SETUP-WORKLEVEL-V11.sql in Supabase ausführen.");
      setLinkBusy(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.token) {
      const url = `${window.location.origin}/angebot/${row.token}`;
      try {
        await navigator.clipboard.writeText(url);
        setLinkInfo("Kundenlink erstellt und in die Zwischenablage kopiert.");
      } catch {
        setLinkInfo(`Kundenlink: ${url}`);
      }
      setActiveLink({
        id: row.id,
        token: row.token,
        expires_at: row.expires_at,
        revoked_at: null,
        created_at: new Date().toISOString(),
        last_opened_at: null,
      });
      await loadDocs();
      setPreview((p) => (p && p.status === "Entwurf" ? { ...p, status: "Gesendet" } : p));
      await loadPreviewExtras(preview);
    }
    setLinkBusy(false);
  }

  async function revokeCustomerLink() {
    if (!preview) return;
    const s = getSupabaseClient();
    if (!s) return;
    setLinkBusy(true);
    const { error: e } = await s.rpc("revoke_offer_public_link", { p_document: preview.id });
    if (e) setError(e.message);
    else {
      setActiveLink(null);
      setLinkInfo("Kundenlink wurde widerrufen.");
      await loadPreviewExtras(preview);
    }
    setLinkBusy(false);
  }

  async function convertToJob(doc?: Doc, opts?: { openAfter?: boolean }) {
    const target = doc ?? preview;
    if (!target || config.type !== "offer") return;
    if (!canConvertOffer) {
      setError("Keine Berechtigung — nur Büro/Inhaber können Aufträge aus Angeboten erstellen.");
      return;
    }
    if (target.status !== "Angenommen") {
      setError("Nur angenommene Angebote können in einen Auftrag umgewandelt werden.");
      return;
    }
    setBusy(true);
    setError("");
    setConvertResult(null);
    try {
      const row = await createJobFromOffer(target.id, { knownConvertedJobId: target.converted_job_id });
      await reloadCloud();
      await loadDocs();
      const updated = { ...target, converted_job_id: row.id };
      if (!preview || preview.id === target.id) {
        setPreview(updated);
        await loadPreviewExtras(updated);
      }
      setConvertResult(row);
      setConvertHighlight(false);
      setLinkInfo(
        row.already_existed
          ? `Auftrag ${row.job_number || ""} ist bereits mit diesem Angebot verknüpft.`
          : row.job_number
            ? `Auftrag ${row.job_number} aus Angebot erstellt.`
            : "Auftrag aus Angebot erstellt."
      );
      if (opts?.openAfter !== false) {
        router.push(jobAkteHref(row.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auftrag konnte nicht erstellt werden.");
    }
    setBusy(false);
  }

  function reminderSubject(doc: Doc) {
    const level = reminderLevelLabel(doc.reminder_count ?? 0);
    return `${level} ${doc.document_number} – ${company?.name ?? "WORKLEVEL"}`;
  }
  function reminderBody(doc: Doc) {
    const customer = customers.find((c) => Number(c.id) === Number(doc.customer_id));
    const due = doc.due_date ? formatDate(doc.due_date) : "—";
    const days = daysOverdue(doc.due_date, today);
    const overdueLine = days > 0 ? `Die Rechnung ist seit ${days === 1 ? "1 Tag" : `${days} Tagen`} überfällig.` : "Die Zahlungsfrist ist erreicht.";
    const level = reminderLevelLabel(doc.reminder_count ?? 0);
    const rawName = (customer?.name || "").trim();
    const shownName = rawName && rawName === rawName.toLowerCase()
      ? rawName.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
      : rawName;
    const hello = shownName ? `Guten Tag ${shownName}` : "Sehr geehrte Damen und Herren";
    const openAmount = invoiceRemainder(doc.total_amount, doc.amount_paid);
    return `${hello},\n\nim Rahmen unserer ${level} erinnern wir an unsere offene Rechnung ${doc.document_number} über ${euro(openAmount)} (fällig am ${due}).\n${overdueLine}\n\nBitte überweisen Sie den Betrag zeitnah unter Angabe der Rechnungsnummer.\nFalls die Zahlung bereits erfolgt ist, betrachten Sie dieses Schreiben bitte als gegenstandslos.\n\nMit freundlichen Grüßen\n${company?.name ?? ""}`;
  }

  async function downloadReminderPdf() {
    if (!preview || !reminderFallback || !company) return;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const left = 20;
    let y = 24;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text(company.name || "WORKLEVEL", left, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const address = [company.street, [company.postal_code, company.city].filter(Boolean).join(" "), company.phone, company.email].filter(Boolean) as string[];
    for (const line of address) {
      pdf.text(line, left, y);
      y += 5;
    }
    y += 8;
    pdf.text(formatDate(isoToday()), left, y);
    y += 12;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    const subjectLines = pdf.splitTextToSize(reminderFallback.subject, 170);
    pdf.text(subjectLines, left, y);
    y += subjectLines.length * 6 + 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    const bodyLines = pdf.splitTextToSize(reminderFallback.body, 170);
    pdf.text(bodyLines, left, y);
    pdf.save(`Mahnung-${preview.document_number}.pdf`);
  }

  function openReminderDialog() {
    if (!preview) return;
    if (invoiceRemainder(preview.total_amount, preview.amount_paid) <= 0) {
      setError("Eine Rechnung ohne offenen Betrag wird nicht gemahnt.");
      return;
    }
    const customer = customers.find((c) => Number(c.id) === Number(preview.customer_id));
    setReminderFallback({
      to: customer?.email || preview.sent_to_email || "",
      subject: reminderSubject(preview),
      body: reminderBody(preview),
    });
    setReminderInfo("");
    setReminderError("");
    setReminderForId(preview.id);
    setReminderOpen(true);
  }

  async function markReminded(channel: "manual" | "email" | "mailto" | "copy", note?: string) {
    if (!preview) return null;
    const s = getSupabaseClient();
    if (!s) throw new Error("Supabase ist nicht verfügbar.");
    const { data, error: e } = await s.rpc("mark_invoice_reminded", {
      p_document: preview.id,
      p_channel: channel,
      p_note: note || null,
    });
    if (e) throw e;
    const count = (data as any)?.reminder_count ?? (preview.reminder_count ?? 0) + 1;
    const lastAt = (data as any)?.last_reminder_at ?? new Date().toISOString();
    setPreview((p) => {
      if (!p) return p;
      const nextStatus = p.status === "Offen" && p.due_date && p.due_date <= today ? "Überfällig" : p.status;
      return { ...p, reminder_count: count, last_reminder_at: lastAt, status: nextStatus };
    });
    await loadDocs();
    await loadPreviewExtras(preview);
    return data;
  }

  async function copyReminderText() {
    if (!reminderFallback) return;
    setReminderBusy(true);
    setReminderError("");
    try {
      const textToCopy = `${reminderFallback.subject}\n\n${reminderFallback.body}`;
      try {
        await navigator.clipboard.writeText(textToCopy);
        setReminderInfo("Mahnungstext in die Zwischenablage kopiert.");
      } catch {
        setReminderInfo(textToCopy);
      }
      await markReminded("copy", "Text kopiert");
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : "Mahnung konnte nicht vermerkt werden. Bitte SETUP-WORKLEVEL-V12.6-REMINDERS.sql ausführen.");
    }
    setReminderBusy(false);
  }

  async function mailtoReminder() {
    if (!reminderFallback) return;
    setReminderBusy(true);
    setReminderError("");
    try {
      await markReminded("mailto", "E-Mail-Programm geöffnet");
      const mailto = `mailto:${encodeURIComponent(reminderFallback.to || "")}?subject=${encodeURIComponent(reminderFallback.subject)}&body=${encodeURIComponent(reminderFallback.body)}`;
      window.location.href = mailto;
      setReminderInfo("Mahnung vermerkt. E-Mail-Programm geöffnet (PDF ggf. manuell anhängen).");
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : "Mahnung konnte nicht vermerkt werden.");
    }
    setReminderBusy(false);
  }

  async function logReminderOnly() {
    setReminderBusy(true);
    setReminderError("");
    try {
      await markReminded("manual", "Manuell vermerkt");
      setReminderInfo("Mahnung / Erinnerung wurde vermerkt (ohne E-Mail).");
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : "Mahnung konnte nicht vermerkt werden. Bitte SETUP-WORKLEVEL-V12.6-REMINDERS.sql ausführen.");
    }
    setReminderBusy(false);
  }

  async function sendReminderEmail() {
    if (!preview || !company || !reminderFallback) return;
    setReminderBusy(true);
    setReminderError("");
    setReminderInfo("");
    const to = reminderFallback.to.trim();
    if (!to) {
      setReminderError("Keine Empfänger-E-Mail. Bitte den Text kopieren oder das E-Mail-Programm öffnen.");
      setReminderBusy(false);
      return;
    }
    try {
      // Always log first — offline workflow stays useful without Resend
      await markReminded("email", `Versuch an ${to}`);
      const bytes = await documentFile(preview, previewItems);
      const attachmentBase64 = bytesToBase64(bytes);
      const s = getSupabaseClient();
      if (!s) throw new Error("Supabase ist nicht verfügbar.");
      const { data: sessionData } = await s.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Bitte erneut anmelden.");
      const res = await fetch("/api/send-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          documentId: preview.id,
          to,
          subject: reminderFallback.subject,
          text: reminderFallback.body,
          filename: `${preview.document_number}.pdf`,
          attachmentBase64,
          fromName: company.name,
          replyTo: company.email || undefined,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setReminderInfo("Mahnung vermerkt. Firmenpostfach noch nicht verbunden — bitte unter Firmendaten einrichten oder die E-Mail-App nutzen.");
      } else if (!res.ok) {
        setReminderInfo(`Mahnung vermerkt. Der E-Mail-Versand ist fehlgeschlagen: ${result?.error || res.status}. Bitte den Text kopieren oder das E-Mail-Programm öffnen.`);
      } else {
        const providerId = result?.id ? String(result.id) : null;
        if (providerId) {
          await logEvent("sent", { email: to, method: result.provider || "email", provider_id: providerId, context: "reminder" });
        }
        setReminderInfo(
          providerId
            ? `Mahnung vermerkt und E-Mail an ${to} gesendet. Siehe Versandprotokoll.`
            : `Mahnung vermerkt und E-Mail an ${to} gesendet. Siehe Versandprotokoll.`
        );
      }
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : "Mahnung fehlgeschlagen.");
    }
    setReminderBusy(false);
  }

  async function openDraftEditor(doc: Doc) {
    if (doc.status !== "Entwurf") {
      setError("Nur Entwürfe können bearbeitet werden.");
      return;
    }
    const s = getSupabaseClient();
    if (!s) return;
    const { data, error: itemError } = await s.from("document_items").select("*").eq("document_id", doc.id).order("position");
    if (itemError) { setError(itemError.message); return; }
    setEditingId(doc.id);
    setForm({
      customerId: String(doc.customer_id ?? ""),
      jobId: doc.job_id || "",
      issueDate: doc.issue_date,
      dueDate: doc.due_date || "",
      validUntil: doc.valid_until || "",
      title: doc.title || "",
      intro: doc.intro_text || "",
      notes: isOfferLetter(doc.notes) ? "" : doc.notes || "",
      vatRate: Number(doc.vat_rate) || 19,
      taxationMode: doc.taxation_mode || "standard",
      status: "Entwurf",
    });
    const loaded = ((data ?? []) as Item[]).map((item, index) => ({
      position: index + 1,
      item_type: item.item_type || "service",
      description: item.description || "",
      quantity: Number(item.quantity) || 0,
      unit: item.unit || "Stk.",
      unit_price: Number(item.unit_price) || 0,
      line_total: Number(item.line_total) || 0,
    }));
    setItems(loaded.length ? loaded : [{ position: 1, item_type: "service", description: "", quantity: 1, unit: "Stk.", unit_price: 0, line_total: 0 }]);
    if (isOfferLetter(doc.notes)) {
      const parsed = parseOfferLetter(doc.notes);
      if (parsed) {
        setOfferLayout("vertrag");
        setLetter(parsed);
        setLetterTouched(true);
      }
    }
    setPreview(null);
    setOpen(true);
  }

  async function deleteDraft(doc: Doc) {
    if (doc.status !== "Entwurf") return;
    if (!(await ask(`${doc.document_number} löschen? Nur unversendete Entwürfe können entfernt werden. Die Nummer wird nicht neu vergeben.`, "Löschen"))) return;
    const s = getSupabaseClient();
    if (!s) return;
    setBusy(true);
    setError("");
    await s.from("document_items").delete().eq("document_id", doc.id);
    const { error: delError } = await s.from("documents").delete().eq("id", doc.id).eq("status", "Entwurf");
    if (delError) setError(delError.message);
    else {
      setPreview(null);
      await loadDocs();
    }
    setBusy(false);
  }

  async function undoPayment() {
    if (!preview) return;
    if (!(await ask(`${preview.document_number}: Zahlung zurücknehmen? Die Rechnung wird wieder offen.`, "Zurücknehmen"))) return;
    setBusy(true);
    setError("");
    try {
      const next = await unmarkInvoicePaid(preview.id);
      await loadDocs();
      const updated = { ...preview, status: next, paid_at: null, payment_note: null, amount_paid: 0 };
      setPreview(updated);
      await loadPreviewExtras(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zahlung konnte nicht zurückgenommen werden.");
    }
    setBusy(false);
  }

  async function markPaid() {
    if (!preview) return;
    const ok = await ask(`${preview.document_number} als bezahlt markieren? Der offene Betrag gilt danach als bezahlt.`, "Als bezahlt");
    if (!ok) return;
    setBusy(true);
    try {
      await markInvoicePaid(preview.id);
      await loadDocs();
      setPreview((p) => (p ? { ...p, status: "Bezahlt", paid_at: p.paid_at || new Date().toISOString(), amount_paid: Number(p.total_amount || 0) } : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zahlung konnte nicht gespeichert werden.");
    }
    setBusy(false);
  }

  async function recordPartial() {
    if (!preview) return;
    const s = getSupabaseClient();
    if (!s) return;
    const amount = Number(String(payAmount).replace(/\s/g, "").replace(",", "."));
    const already = Number(preview.amount_paid || 0);
    const total = Number(preview.total_amount || 0);
    const rest = invoiceRemainder(total, already);
    if (!(amount > 0) || amount > rest + 0.004) {
      setError(`Bitte einen Betrag zwischen 0,01 € und ${euro(rest)} eingeben.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const nextPaid = Math.round((already + amount) * 100) / 100;
      if (nextPaid + 0.004 >= total) {
        await markInvoicePaid(preview.id, `Teilzahlung ${euro(amount)}, damit bezahlt`);
        setPreview((p) => (p ? { ...p, status: "Bezahlt", paid_at: p.paid_at || new Date().toISOString(), amount_paid: total } : p));
      } else {
        const note = `Teilzahlung ${euro(nextPaid)} von ${euro(total)}`;
        const { error: payError } = await s.from("documents").update({
          amount_paid: nextPaid,
          payment_note: note,
          updated_at: new Date().toISOString(),
        }).eq("id", preview.id);
        if (payError) throw new Error(payError.message);
        await s.rpc("log_document_event", {
          p_document: preview.id,
          p_event_type: "payment_recorded",
          p_details: { amount, amount_paid: nextPaid },
        });
        setPreview((p) => (p ? { ...p, amount_paid: nextPaid, payment_note: note } : p));
      }
      setPayAmount("");
      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Teilzahlung konnte nicht gespeichert werden.");
    }
    setBusy(false);
  }

  const revenueDocs = docs.filter((d) => {
    if (d.status === "Storniert" || d.status === "Stornorechnung") return false;
    if (config.type === "invoice" && d.status === "Entwurf") return false;
    return true;
  });
  const sum = revenueDocs.reduce((s, d) => s + Number(d.total_amount || 0), 0);
  const openCount = docs.filter((d) => {
    const label = config.type === "invoice" ? visibleInvoiceStatus(d.status, d.paid_at, d.amount_paid, d.total_amount) : d.status;
    return !["Bezahlt", "Abgelehnt", "Storniert", "Stornorechnung"].includes(label);
  }).length;
  const acceptedCount = docs.filter((d) => d.status === "Angenommen").length;
  const acceptedPending = docs.filter((d) => d.status === "Angenommen" && !d.converted_job_id);
  const acceptedPendingCount = acceptedPending.length;
  const paidCount = docs.filter((d) => d.status === "Bezahlt").length;
  const overdueDocs = config.type === "invoice" ? docs.filter((d) => isInvoiceOverdue(d, today)) : [];
  const overdueCount = overdueDocs.length;
  const overdueSum = overdueDocs.reduce((s, d) => s + invoiceRemainder(d.total_amount, d.amount_paid), 0);

  return (
    <main className="page">
      <PageHeader
        title={config.title}
        subtitle={config.subtitle}
        action={
          <div className="headerActions">
            {(config.type === "offer" || config.type === "invoice") && (
              <Link className="ghostBtn" href="/vorlagen">
                Vorlagen
              </Link>
            )}
            <button
              className="primaryBtn"
              onClick={() => {
                if (editingId) {
                  setEditingId(null);
                  setForm({ customerId: "", jobId: "", issueDate: today, dueDate: "", validUntil: "", title: "", intro: "", notes: "", vatRate: 19, taxationMode: "standard", status: "Entwurf" });
                  setItems([{ position: 1, item_type: "service", description: "Leistung", quantity: 1, unit: "Std.", unit_price: 0, line_total: 0 }]);
                }
                setSelectedTemplateId("");
                setOpen(true);
              }}
            >
              + {config.newLabel}
            </button>
          </div>
        }
      />
      {error && <div className="loginError pageError">{error}</div>}
      <div className="statsGrid">
        <StatCard label="Dokumente" value={String(docs.length)} hint="In dieser Firma" />
        <StatCard label="Aktiv" value={String(openCount)} hint="Nicht abgeschlossen" />
        <StatCard label={config.type === "invoice" ? "Umsatz" : "Gesamtwert"} value={euro(sum)} hint={config.type === "invoice" ? "ohne Entwürfe/Stornos" : "Brutto"} />
        {config.type === "offer" ? (
          <StatCard
            label="Ohne Auftrag"
            value={String(acceptedPendingCount)}
            hint={acceptedPendingCount ? "Angenommen → Auftrag anlegen" : `${acceptedCount} angenommen, alle verknüpft`}
          />
        ) : config.type === "invoice" ? (
          <StatCard label="Überfällig" value={String(overdueCount)} hint={overdueCount ? `${euro(overdueSum)} · siehe Mahnungen` : "Keine überfälligen"} />
        ) : (
          <StatCard
            label="Unterzeichnet"
            value={String(docs.filter((d) => d.status === "Unterzeichnet").length)}
            hint="Kundenbestätigung"
          />
        )}
      </div>
      {config.type === "invoice" && (
        <div className="eInvoiceNotice">
          <strong>E-Rechnung (ZUGFeRD)</strong>
          <span>
            {company?.name && company.postal_code && company.city && (company.vat_id || company.tax_number)
              ? "PDF-Download, Teilen und E-Mail enthalten die elektronische Rechnung. In der Liste steht E-Rechnung, wenn der Kunde Name, PLZ und Ort hat."
              : "In den Firmendaten fehlen noch PLZ, Ort oder USt-IdNr. / Steuernummer. Bis dahin bleibt der Download eine normale PDF."}
            {" "}
            <Link className="textLink" href="/firmendaten">Firmendaten prüfen →</Link>
          </span>
        </div>
      )}

      {config.type === "invoice" && overdueCount > 0 && (
        <div className="overdueBanner" style={{ marginBottom: 14 }}>
          <strong>{overdueCount} überfällig</strong>
          <span>
            {euro(overdueSum)} offen ·{" "}
            <Link className="textLink" href="/mahnungen">
              Zum Mahnwesen →
            </Link>
          </span>
        </div>
      )}

      {config.type === "offer" && acceptedPendingCount > 0 && canConvertOffer && (
        <div className="overdueBanner offerAcceptBanner" style={{ marginBottom: 14 }}>
          <strong>{acceptedPendingCount} Angebot{acceptedPendingCount === 1 ? "" : "e"} angenommen — noch ohne Auftrag</strong>
          <span>
            Geldpfad: Angebot → Auftrag → Plantafel.{" "}
            <button
              type="button"
              className="textLink"
              style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}
              onClick={() => {
                setStatusFilter("Angenommen");
                const first = acceptedPending[0];
                if (first) {
                  void showPreview(first);
                  setConvertHighlight(true);
                }
              }}
            >
              Erstes öffnen →
            </button>
          </span>
        </div>
      )}

      {config.type === "delivery_note" && (
        <div className="cloudNotice" style={{ marginBottom: 12 }}>
          <span className="cloudDot" />
          Ein Lieferschein ist der Materialnachweis zum Auftrag. Am schnellsten über die Auftragsakte mit „Lieferschein erstellen“, oder hier den Auftrag wählen. Das übernimmt die Materialpositionen.
        </div>
      )}

      <div className="toolbar">
        <div className="toolbarLeft">
          <input
            className="searchInput"
            placeholder={`${config.singular}-Nr., Kunde, Telefon, Adresse...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>Alle</option>
            {statusOptions[config.type].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="toolbarRight">
          <span className="cellSub">
            {filtered.length} {filtered.length === 1 ? config.singular : config.title}
          </span>
        </div>
      </div>

      <div className="phoneDocs phoneOnly">
        {loading ? (
          <div className="phoneEmpty">Dokumente werden geladen…</div>
        ) : filtered.length === 0 ? (
          <div className="phoneEmpty">{docs.length === 0 ? `Noch keine ${config.title}` : "Keine Treffer"}</div>
        ) : filtered.map((d) => {
          const c = customers.find((x) => Number(x.id) === Number(d.customer_id));
          const overdue = config.type === "invoice" && isInvoiceOverdue(d, today);
          const days = overdue ? daysOverdue(d.due_date, today) : 0;
          const ready = Boolean(company?.postal_code && company.city && (company.vat_id || company.tax_number) && c?.name && c.postalCode && c.city);
          const statusLabel = config.type === "invoice" ? visibleInvoiceStatus(d.status, d.paid_at, d.amount_paid, d.total_amount) : d.status;
          const shownAmount = config.type === "invoice" ? invoiceRemainder(d.total_amount, d.amount_paid) : Number(d.total_amount);
          return (
            <article className={overdue ? "phoneDoc isOverdue" : "phoneDoc"} key={d.id}>
              <button
                type="button"
                className="phoneDocMain"
                onClick={() => { setConvertHighlight(d.status === "Angenommen" && !d.converted_job_id); setConvertResult(null); void showPreview(d); }}
              >
                <span className="phoneDocTop">
                  <strong>{d.document_number}</strong>
                  <b>{euro(shownAmount)}</b>
                </span>
                <span className="phoneDocWho">{c?.name ?? "—"}</span>
                <span className="phoneDocMeta">
                  {formatDate(d.issue_date)}
                  {config.type === "invoice" && d.due_date ? ` · fällig ${formatDate(d.due_date)}` : ""}
                  {c?.city ? ` · ${c.city}` : ""}
                </span>
                <span className="phoneDocBadges">
                  <Badge tone={overdue ? "red" : tone(statusLabel)}>{statusLabel}</Badge>
                  {overdue && <span className="overduePill">Überfällig{days ? ` · ${days} T.` : ""}</span>}
                  {config.type === "invoice" && <Badge tone={ready ? "green" : "gray"}>{ready ? "E-Rechnung" : "E-Rechnung offen"}</Badge>}
                </span>
              </button>
              {config.type === "offer" && d.status === "Angenommen" && !d.converted_job_id && canConvertOffer && (
                <button className="phoneDocExtra" type="button" disabled={busy} onClick={() => void convertToJob(d)}>Auftrag anlegen</button>
              )}
              {config.type === "offer" && d.converted_job_id && (
                <Link className="phoneDocExtra" href={jobAkteHref(d.converted_job_id)}>Zum Auftrag</Link>
              )}
            </article>
          );
        })}
      </div>

      <div className="tableWrap deskOnly">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Kunde</th>
              <th>Datum</th>
              {config.type === "invoice" && <th>Fällig</th>}
              <th>Betrag</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <LoadingState label="Dokumente werden geladen…" />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title={docs.length === 0 ? `Noch keine ${config.title}` : "Keine Treffer"}
                    hint={
                      docs.length === 0
                        ? config.type === "delivery_note"
                          ? "Aus der Auftragsakte („Lieferschein erstellen“) oder hier mit Auftrag + Materialpositionen anlegen."
                          : `Lege das erste Dokument mit „+ ${config.newLabel}“ an.`
                        : "Suche oder Statusfilter anpassen."
                    }
                  >
                    {docs.length === 0 && config.type === "delivery_note" ? (
                      <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                        Tipp: In der <a className="textLink" href="/auftraege">Auftragsakte</a> Material prüfen und Lieferschein in einem Klick erzeugen.
                      </p>
                    ) : null}
                  </EmptyState>
                </td>
              </tr>
            ) : (
              filtered.map((d) => {
                const c = customers.find((x) => Number(x.id) === Number(d.customer_id));
                const overdue = config.type === "invoice" && isInvoiceOverdue(d, today);
                const days = overdue ? daysOverdue(d.due_date, today) : 0;
                return (
                  <tr key={d.id} className={overdue ? "rowOverdue" : undefined}>
                    <td className="orangeText">
                      {d.document_number}
                      {overdue && <span className="overduePill">Überfällig{days ? ` · ${days} T.` : ""}</span>}
                      {config.type === "invoice" && (
                        <span className="eInvoiceMark">
                          <Badge tone={company?.postal_code && company.city && (company.vat_id || company.tax_number) && c?.name && c.postalCode && c.city ? "green" : "gray"}>
                            {company?.postal_code && company.city && (company.vat_id || company.tax_number) && c?.name && c.postalCode && c.city ? "E-Rechnung" : "E-Rechnung offen"}
                          </Badge>
                        </span>
                      )}
                    </td>
                    <td>
                      {c?.name ?? "—"}
                      <span className="cellSub">{c?.phone || c?.city || "—"}</span>
                    </td>
                    <td>{formatDate(d.issue_date)}</td>
                    {config.type === "invoice" && (
                      <td className={overdue ? "dueOverdue" : undefined}>
                        {d.due_date ? formatDate(d.due_date) : "—"}
                        {d.reminder_count ? <span className="cellSub">{d.reminder_count}× · {reminderLevelLabel(d.reminder_count)}</span> : <span className="cellSub">{reminderLevelLabel(0)}</span>}
                      </td>
                    )}
                    <td className="money">
                      {euro(config.type === "invoice" ? invoiceRemainder(d.total_amount, d.amount_paid) : Number(d.total_amount))}
                      {config.type === "invoice" && Number(d.amount_paid || 0) > 0 ? <span className="cellSub">von {euro(Number(d.total_amount))}</span> : null}
                    </td>
                    <td>
                      <select className={`statusSelect compactStatus${overdue ? " statusOverdue" : ""}`} value={config.type === "invoice" ? visibleInvoiceStatus(d.status, d.paid_at, d.amount_paid, d.total_amount) : d.status} onChange={(e) => changeStatus(d.id, e.target.value)}>
                        {statusOptions[config.type].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="rowActions" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {config.type === "offer" && d.status === "Angenommen" && !d.converted_job_id && canConvertOffer && (
                          <button
                            className="primaryBtn smallBtn"
                            type="button"
                            disabled={busy}
                            onClick={() => void convertToJob(d)}
                            title="Auftrag aus Angebot erstellen"
                          >
                            {busy ? "…" : "Auftrag"}
                          </button>
                        )}
                        {config.type === "offer" && d.converted_job_id && (
                          <Link className="ghostBtn smallBtn" href={jobAkteHref(d.converted_job_id)}>
                            Zum Auftrag
                          </Link>
                        )}
                        <button className="ghostBtn smallBtn" onClick={() => { setConvertHighlight(d.status === "Angenommen" && !d.converted_job_id); setConvertResult(null); void showPreview(d); }}>
                          Öffnen
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {open && !draftPdfUrl && (
        <Modal title={editingId ? `${config.singular} bearbeiten` : config.type === "offer" ? `Neues ${config.singular}` : config.type === "delivery_note" ? `Neuer ${config.singular}` : `Neue ${config.singular}`} subtitle={config.type === "delivery_note" ? "Kunde wählen und den Auftrag übernehmen. Die Materialpositionen werden übernommen." : "Kunde, Auftrag und Positionen auswählen"} onClose={() => { setOpen(false); setEditingId(null); }}>
          <form onSubmit={submit}>
            <div className="formGrid">
              {(config.type === "offer" || config.type === "invoice") && (
                <div className="formField wide">
                  <label>Fertige Vorlage (optional)</label>
                  <select
                    className="select"
                    value={selectedTemplateId}
                    onChange={(e) => applyTemplate(e.target.value)}
                  >
                    <option value="">Ohne Vorlage — manuell ausfüllen</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="fieldHint">
                      Noch keine Vorlagen.{" "}
                      <Link className="textLink" href="/vorlagen">
                        Vorlage anlegen →
                      </Link>
                    </p>
                  )}
                </div>
              )}
              <div className="formField wide">
                <label>Kunde</label>
                <select className="select" required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  <option value="">Kunde wählen</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField wide">
                <label>{config.type === "delivery_note" ? "Auftrag übernehmen (Material laden)" : "Auftrag übernehmen (optional)"}</label>
                <select className="select" value={form.jobId} onChange={(e) => importJob(e.target.value)}>
                  <option value="">{config.type === "delivery_note" ? "Auftrag wählen…" : "Ohne Auftrag"}</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.number} · {j.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="formField">
                <label>Datum</label>
                <input className="input" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
              </div>
              {config.type === "invoice" && (
                <div className="formField">
                  <label>Fällig am</label>
                  <input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
              )}
              {config.type === "offer" && (
                <div className="formField">
                  <label>Gültig bis</label>
                  <input className="input" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
                </div>
              )}
              {config.type === "offer" && (
                <div className="formField wide">
                  <label>Art des Angebots</label>
                  <div className="offerKind">
                    <button type="button" className={offerLayout === "positionen" ? "isOn" : ""} onClick={() => setOfferLayout("positionen")}>Positionsangebot</button>
                    <button type="button" className={offerLayout === "vertrag" ? "isOn" : ""} onClick={chooseVertrag}>Vertragsangebot</button>
                  </div>
                  <p className="fieldHint">Vertragsangebot ist das mehrseitige Schreiben mit Kopfzeile, Abschnitten, Nettopreisen und Auftragserteilung.</p>
                </div>
              )}
              {!useLetter && <div className="formField wide">
                <label>Umsatzsteuer</label>
                <select
                  className="select"
                  value={form.taxationMode}
                  onChange={(e) => setForm({ ...form, taxationMode: e.target.value as "standard" | "small_business" })}
                >
                  <option value="standard">Mit Umsatzsteuer (Regelbesteuerung)</option>
                  <option value="small_business">Kleinunternehmer § 19 Abs. 1 UStG – ohne Umsatzsteuer</option>
                </select>
              </div>}
              {!useLetter && <div className="formField">
                <label>MwSt. %</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={form.taxationMode === "small_business"}
                  value={form.taxationMode === "small_business" ? 0 : form.vatRate}
                  onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })}
                />
              </div>}
              {!useLetter && form.taxationMode === "small_business" && (
                <div className="formField wide">
                  <div className="taxNotice">{smallBusinessNote}</div>
                </div>
              )}
              <div className="formField wide">
                <label>{useLetter ? "Untertitel" : "Titel"}</label>
                <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={useLetter ? "Winterdienst - Saison 2026/2027" : config.singular} />
              </div>
              <div className="formField wide">
                <label>{useLetter ? "Anschreiben" : "Vorbemerkungen"}</label>
                <textarea
                  className="textarea"
                  rows={useLetter ? 6 : 3}
                  value={form.intro}
                  onChange={(e) => setForm({ ...form, intro: e.target.value })}
                  placeholder={useLetter ? "Sehr geehrte Damen und Herren, …" : "Einleitungstext vor den Positionen (z. B. Leistungsbeschreibung, Rahmenbedingungen)"}
                />
                <p className="fieldHint">{useLetter ? "Steht unter dem Block Auftragnehmer / Auftraggeber." : "Erscheint auf dem Dokument vor den Positionen."}</p>
              </div>
            </div>
            {useLetter ? (
              <div className="letterEditor">
                <div className="letterCard">
                  <div className="formField">
                    <label>Kopfzeile rechts</label>
                    <input className="input" value={letter.header} onChange={(e) => setLetter({ ...letter, header: e.target.value })} placeholder="Winterdienst 2026/2027" />
                    <p className="fieldHint">Steht rechts in der blauen Leiste. Links steht der Firmenname.</p>
                  </div>
                  <button type="button" className="ghostBtn smallBtn" onClick={applyWinterdienst}>Winterdienst 2026/2027 laden</button>
                </div>
                <div className="letterCard">
                  <div className="docItemsHead">
                    <strong>Abschnitte</strong>
                    <button type="button" className="ghostBtn smallBtn" onClick={() => setLetter({ ...letter, sections: [...letter.sections, { heading: `${letter.sections.length + 1}. `, body: "" }] })}>+ Abschnitt</button>
                  </div>
                  <p className="fieldHint">Eine Zeile mit „- “ wird ein Aufzählungspunkt. @preise setzt die Preistabelle. @seite beginnt eine neue Seite.</p>
                  {letter.sections.map((section, index) => (
                    <div className="letterSection" key={index}>
                      <div className="letterSectionHead">
                        <input className="input" aria-label={`Überschrift Abschnitt ${index + 1}`} value={section.heading} onChange={(e) => setLetter({ ...letter, sections: letter.sections.map((item, itemIndex) => itemIndex === index ? { ...item, heading: e.target.value } : item) })} />
                        <button type="button" className="dangerIcon" aria-label={`Abschnitt ${index + 1} entfernen`} onClick={() => setLetter({ ...letter, sections: letter.sections.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
                      </div>
                      <textarea className="textarea" rows={5} aria-label={`Text Abschnitt ${index + 1}`} value={section.body} onChange={(e) => setLetter({ ...letter, sections: letter.sections.map((item, itemIndex) => itemIndex === index ? { ...item, body: e.target.value } : item) })} />
                    </div>
                  ))}
                </div>
                <div className="letterCard">
                  <div className="docItemsHead">
                    <strong>Preise netto</strong>
                    <button type="button" className="ghostBtn smallBtn" onClick={() => setLetterPrices([...letterPrices, { description: "", price: "" }])}>+ Preiszeile</button>
                  </div>
                  {letterPrices.map((row, index) => (
                    <div className="letterPriceRow" key={index}>
                      <input className="input" aria-label={`Leistung ${index + 1}`} placeholder="Leistung" value={row.description} onChange={(e) => setLetterPrices(letterPrices.map((item, itemIndex) => itemIndex === index ? { ...item, description: e.target.value } : item))} />
                      <input className="input" aria-label={`Preis ${index + 1}`} placeholder="75,00 EUR" value={row.price} onChange={(e) => setLetterPrices(letterPrices.map((item, itemIndex) => itemIndex === index ? { ...item, price: e.target.value } : item))} />
                      <button type="button" className="dangerIcon" aria-label={`Preiszeile ${index + 1} entfernen`} onClick={() => setLetterPrices(letterPrices.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                    </div>
                  ))}
                </div>
                <div className="letterCard">
                  <label>Schluss</label>
                  <textarea className="textarea" rows={4} value={letter.closing} onChange={(e) => setLetter({ ...letter, closing: e.target.value })} />
                  <p className="fieldHint">Danach setzt das PDF Name, Anschrift, Telefon und E-Mail aus den Firmendaten.</p>
                </div>
                <div className="letterCard">
                  <div className="docItemsHead">
                    <strong>Auftragserteilung</strong>
                    <button type="button" className="ghostBtn smallBtn" onClick={() => setLetter({ ...letter, orderRows: [...letter.orderRows, { label: "", value: "" }] })}>+ Zeile</button>
                  </div>
                  {letter.orderRows.map((row, index) => (
                    <div className="letterOrderRow" key={index}>
                      <input className="input" aria-label={`Feld ${index + 1}`} placeholder="Auftraggeber:" value={row.label} onChange={(e) => setLetter({ ...letter, orderRows: letter.orderRows.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item) })} />
                      <input className="input" aria-label={`Eintrag ${index + 1}`} placeholder="Leer lassen für eine Unterschriftslinie" value={row.value} onChange={(e) => setLetter({ ...letter, orderRows: letter.orderRows.map((item, itemIndex) => itemIndex === index ? { ...item, value: e.target.value } : item) })} />
                      <button type="button" className="dangerIcon" aria-label={`Zeile ${index + 1} entfernen`} onClick={() => setLetter({ ...letter, orderRows: letter.orderRows.filter((_, itemIndex) => itemIndex !== index) })}>×</button>
                    </div>
                  ))}
                  <label>Hinweis unter der Auftragserteilung</label>
                  <textarea className="textarea" rows={3} value={letter.hint} onChange={(e) => setLetter({ ...letter, hint: e.target.value })} />
                </div>
              </div>
            ) : (
            <>
            <div className="docItemsEditor">
              <div className="catalogPicker">
                <label htmlFor="document-material-search">Material aus dem Lager hinzufügen</label>
                <input id="document-material-search" className="input" placeholder="Materialname oder Artikelnummer suchen…" value={catalogQuery} onChange={e => setCatalogQuery(e.target.value)} />
                <select className="select" aria-label="Material auswählen" value="" onChange={e => addCatalogMaterial(e.target.value)}>
                  <option value="">Material auswählen – Preis und Einheit übernehmen</option>
                  {catalog.filter(m => `${m.name} ${m.sku ?? ""}`.toLowerCase().includes(catalogQuery.toLowerCase())).map(m => <option key={m.id} value={m.id}>{m.name}{m.sku ? ` (${m.sku})` : ""} · {euro(Number(m.sales_price))} / {m.unit}</option>)}
                </select>
              </div>
              <div className="docItemsHead">
                <strong>Positionen</strong>
                <button type="button" className="ghostBtn smallBtn" onClick={addLine}>
                  + Position
                </button>
              </div>
              {items.map((it, i) => (
                <div className="docItemRow" key={i}>
                  <span className="posNo">{i + 1}</span>
                  <select className="select" value={it.item_type} onChange={(e) => setLine(i, { item_type: e.target.value as Item["item_type"] })}>
                    <option value="service">Leistung</option>
                    <option value="material">Material</option>
                    <option value="text">Text</option>
                  </select>
                  <input className="input docDesc" required placeholder="Beschreibung" value={it.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <input className="input docQty" type="number" min="0" step="0.001" value={it.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
                  <select className="select docUnit" aria-label={`Einheit Position ${i + 1}`} value={it.unit} onChange={(e) => setLine(i, { unit: e.target.value })}>
                    {!UNIT_OPTIONS.includes(it.unit) && <option value={it.unit}>{it.unit || "Einheit"}</option>}
                    {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                  <input className="input docPrice" type="number" min="0" step="0.01" inputMode="decimal" aria-label={`Einzelpreis Position ${i + 1}`} value={Number.isFinite(it.unit_price) ? it.unit_price : ""} onChange={(e) => setLine(i, { unit_price: e.target.value.trim() === "" ? Number.NaN : Number(e.target.value) })} />
                  <strong>{euro((Number.isFinite(it.quantity) ? it.quantity : 0) * (Number.isFinite(it.unit_price) ? it.unit_price : 0))}</strong>
                  <button type="button" className="dangerIcon" aria-label={`Position ${i + 1} entfernen`} title="Position entfernen" onClick={() => removeLine(i)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="docTotals">
              <span>
                Netto <b>{euro(subtotal)}</b>
              </span>
              {form.taxationMode === "small_business" ? (
                <span>
                  Umsatzsteuer <b>entfällt (§ 19 UStG)</b>
                </span>
              ) : (
                <span>
                  MwSt. {form.vatRate}% <b>{euro(vat)}</b>
                </span>
              )}
              <span className="docGrandTotal">
                Gesamt <b>{euro(total)}</b>
              </span>
            </div>
            <div className="formField">
              <label>Nachbemerkungen</label>
              <textarea
                className="textarea"
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Abschluss-Hinweise (z. B. Zahlungsbedingungen, Garantie, Gültigkeit)"
              />
              <p className="fieldHint">Erscheint auf dem Dokument nach den Summen.</p>
            </div>
            </>
            )}
            {draftPreviewError && <p role="alert" className="loginError">{draftPreviewError}</p>}
            <div className="formActions">
              <button type="button" className="ghostBtn" onClick={() => setOpen(false)}>
                Abbrechen
              </button>
              <button type="button" className="ghostBtn" disabled={busy || draftPreviewBusy} onClick={() => void previewDraft()}>
                {draftPreviewBusy ? "Vorschau wird erstellt…" : "Vorschau"}
              </button>
              <button className="primaryBtn" disabled={busy || draftPreviewBusy}>
                {busy ? "Speichert..." : "Dokument erstellen"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {draftPdfUrl && (
        <Modal title={`${config.singular} – Vorschau`} subtitle="Noch nicht gespeichert oder versendet. Die Dokumentnummer wird beim Erstellen vergeben." onClose={() => setDraftPdfUrl(null)}>
          <div style={{ display: "grid", gap: 16 }}>
            {draftPages.map((page, index) => <img key={index} src={page} alt={`${config.singular} – Vorschau Seite ${index + 1}`} style={{ width: "100%", height: "auto", background: "white" }} />)}
          </div>
          <div className="formActions">
            <a className="ghostBtn" href={draftPdfUrl} target="_blank" rel="noreferrer">PDF öffnen</a>
            <button type="button" className="primaryBtn" onClick={() => setDraftPdfUrl(null)}>Zurück zum Bearbeiten</button>
          </div>
        </Modal>
      )}

      {preview && (
        <Modal title={`${config.singular} ${preview.document_number}`} subtitle={config.type === "invoice" ? "Vorschau, E-Rechnung und Versand" : "Vorschau, Versand und nächster Schritt"} onClose={() => setPreview(null)}>
          {parseOfferLetter(preview.notes) ? (
            <div className="docPreview">
              {letterPages.length > 0 ? (
                <div style={{ display: "grid", gap: 16 }}>
                  {letterPages.map((page, index) => <img key={index} src={page} alt={`${config.singular} Seite ${index + 1}`} style={{ width: "100%", height: "auto", background: "white" }} />)}
                </div>
              ) : (
                <OfferLetterView
                  title={preview.title}
                  intro={preview.intro_text}
                  letter={parseOfferLetter(preview.notes)!}
                  prices={previewItems.map((item) => ({ description: item.description, price: letterItemPrice(item) }))}
                />
              )}
            </div>
          ) : (
          <div className="docPreview">
            <div className="docPreviewTop">
              <div>
                {company?.logo_url && <img className="docLogo" src={company.logo_url} alt="Firmenlogo" />}
                <h2>{company?.name}</h2>
                <p>
                  {company?.street}
                  <br />
                  {company?.postal_code} {company?.city}
                  <br />
                  {company?.email}
                </p>
              </div>
              <div className="docPreviewMeta">
                <h2>{config.singular}</h2>
                <strong>{preview.document_number}</strong>
                <span>{formatDate(preview.issue_date)}</span>
              </div>
            </div>
            {(() => {
              const c = customers.find((x) => Number(x.id) === Number(preview.customer_id));
              const linkedJob = preview.job_id ? jobs.find((j) => j.id === preview.job_id) : undefined;
              const site = linkedJob?.customerSiteId
                ? customerSites.find((s) => s.id === linkedJob.customerSiteId)
                : undefined;
              return (
                <>
                  <div className="docCustomer">
                    <small>RECHNUNGSADRESSE / KUNDE</small>
                    <strong>{c?.name}</strong>
                    <span>{c?.contact}</span>
                    <span>{c?.street}</span>
                    <span>
                      {c?.postalCode} {c?.city}
                    </span>
                  </div>
                  {site ? (
                    <div className="docCustomer docEinsatzort">
                      <small>EINSATZORT</small>
                      <strong>{site.name}</strong>
                      <span>{site.street}</span>
                      <span>
                        {site.postalCode} {site.city}
                      </span>
                      {site.tenantName ? <span>Mieter: {site.tenantName}</span> : null}
                    </div>
                  ) : null}
                </>
              );
            })()}
            <h3>{preview.title}</h3>
            {preview.intro_text && <p>{preview.intro_text}</p>}
            <table className="docPreviewTable">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Beschreibung</th>
                  <th>Menge</th>
                  <th>Einzel</th>
                  <th>Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {previewItems.map((it, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{it.description}</td>
                    <td>
                      {deNumber(Number(it.quantity), 3)} {it.unit}
                    </td>
                    <td>{euro(Number(it.unit_price))}</td>
                    <td>{euro(Number(it.line_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="docPreviewTotals">
              <span>
                Netto <b>{euro(Number(preview.subtotal))}</b>
              </span>
              {preview.taxation_mode === "small_business" ? (
                <span>
                  Umsatzsteuer <b>entfällt</b>
                </span>
              ) : (
                <span>
                  MwSt. {Number(preview.vat_rate)}% <b>{euro(Number(preview.vat_amount))}</b>
                </span>
              )}
              <span>
                Gesamt <b>{euro(Number(preview.total_amount))}</b>
              </span>
            </div>
            {preview.taxation_mode === "small_business" && <p className="taxNotice lightTaxNotice">{preview.tax_note || smallBusinessNote}</p>}
            {preview.notes && <p className="docNote">{preview.notes}</p>}
            <div className="docFooterText">{company?.document_footer}</div>
          </div>
          )}

          <div className="documentSendInfo">
            {preview.sent_at ? (
              <>
                <span>✓ Versandt</span>
                <small>
                  {preview.sent_to_email || ""}
                  {preview.last_sent_at ? ` · ${new Date(preview.last_sent_at).toLocaleString("de-DE")}` : ""}
                </small>
              </>
            ) : (
              <>
                <span>Noch nicht versandt</span>
                <small>PDF, Teilen, E-Mail oder Kundenlink.</small>
              </>
            )}
          </div>

          {config.type === "offer" && (
            <div className="offerPortalBox">
              <div className="offerPortalHead">
                <strong>Kundenportal</strong>
                <span>Sicherer Link · 30 Tage gültig · ohne WORKLEVEL-Login</span>
              </div>
              {activeLink ? (
                <div className="offerPortalActive">
                  <p>
                    Aktiver Link:{" "}
                    <a className="textLink" href={`/angebot/${activeLink.token}`} target="_blank" rel="noreferrer">
                      /angebot/{activeLink.token.slice(0, 12)}…
                    </a>
                  </p>
                  <small>
                    Gültig bis {new Date(activeLink.expires_at).toLocaleString("de-DE")}
                    {activeLink.last_opened_at ? ` · zuletzt geöffnet ${new Date(activeLink.last_opened_at).toLocaleString("de-DE")}` : ""}
                  </small>
                  <div className="formActions" style={{ marginTop: 10 }}>
                    <button
                      className="ghostBtn"
                      type="button"
                      onClick={async () => {
                        const url = `${window.location.origin}/angebot/${activeLink.token}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          setLinkInfo("Link kopiert.");
                        } catch {
                          setLinkInfo(url);
                        }
                      }}
                    >
                      Link kopieren
                    </button>
                    <button className="ghostBtn" type="button" disabled={linkBusy} onClick={createCustomerLink}>
                      Neu erzeugen
                    </button>
                    <button className="ghostBtn" type="button" disabled={linkBusy} onClick={revokeCustomerLink}>
                      Widerrufen
                    </button>
                  </div>
                </div>
              ) : (
                <button className="primaryBtn" type="button" disabled={linkBusy} onClick={createCustomerLink}>
                  {linkBusy ? "Erstellt..." : "Kundenlink erstellen"}
                </button>
              )}
              {preview.customer_response_at && (
                <div className="customerResponseBox">
                  <strong>Kundenantwort: {preview.status}</strong>
                  <span>
                    {preview.customer_response_name || "Kunde"} · {new Date(preview.customer_response_at).toLocaleString("de-DE")}
                  </span>
                  {preview.customer_response_message && <p>{preview.customer_response_message}</p>}
                </div>
              )}
              {preview.status === "Angenommen" && !preview.converted_job_id && canConvertOffer && (
                <div
                  className={`offerConvertBox${convertHighlight ? " offerConvertBoxHighlight" : ""}`}
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 10,
                    border: convertHighlight ? "2px solid #f59e0b" : "1px solid var(--border, #e5e7eb)",
                    background: convertHighlight ? "rgba(245, 158, 11, 0.08)" : "rgba(16, 185, 129, 0.06)",
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 6 }}>Angebot angenommen — Auftrag anlegen</strong>
                  <p className="cellSub" style={{ margin: "0 0 10px" }}>
                    Erstellt einen geplanten Auftrag aus diesem Angebot (kein Duplikat, falls schon verknüpft).
                  </p>
                  <button
                    className="primaryBtn"
                    type="button"
                    disabled={busy}
                    onClick={() => void convertToJob(preview, { openAfter: false })}
                  >
                    {busy ? "Erstellt…" : "Auftrag aus Angebot"}
                  </button>
                </div>
              )}
              {(preview.converted_job_id || convertResult) && (
                <div className="sendSuccess" style={{ marginTop: 10 }}>
                  <strong>
                    {convertResult?.already_existed
                      ? "Auftrag bereits verknüpft"
                      : convertResult
                        ? "Auftrag erstellt"
                        : "Auftrag verknüpft"}
                    {convertResult?.job_number ? ` · ${convertResult.job_number}` : ""}
                  </strong>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <Link className="textLink" href={jobAkteHref((preview.converted_job_id || convertResult?.id)!)}>
                      Auftrag öffnen (Akte) →
                    </Link>
                    <Link className="textLink" href={jobPlantafelHref((preview.converted_job_id || convertResult?.id)!)}>
                      Auf Plantafel planen →
                    </Link>
                    <Link className="textLink" href={jobTechnikerHref((preview.converted_job_id || convertResult?.id)!)}>
                      Techniker →
                    </Link>
                  </div>
                </div>
              )}
              {linkInfo && <div className="emailHint" style={{ marginTop: 10 }}>{linkInfo}</div>}
            </div>
          )}

          {config.type === "invoice" && (
            <div className="offerPortalBox">
              <div className="offerPortalHead">
                <strong>Zahlung</strong>
                <span>Zahlungsstatus der Rechnung</span>
              </div>
              <div className="eInvoiceNotice">
                <strong>{eInvoice?.ok ? "E-Rechnung bereit" : "E-Rechnung unvollständig"}</strong>
                <span>
                  {eInvoice?.ok
                    ? "PDF-Download, Teilen und E-Mail enthalten ZUGFeRD (EN 16931). E-Rechnung XML speichert nur die XML-Datei."
                    : `${eInvoice?.problems.join(" ") ?? ""} Die heruntergeladene Datei bleibt eine normale PDF.`}
                </span>
              </div>
              {isInvoiceOverdue(preview, today) && (
                <div className="overdueBanner">
                  <strong>Überfällig</strong>
                  <span>
                    Fällig {preview.due_date ? formatDate(preview.due_date) : "—"}
                    {daysOverdue(preview.due_date, today) ? ` · ${daysOverdue(preview.due_date, today) === 1 ? "1 Tag" : `${daysOverdue(preview.due_date, today)} Tage`}` : ""}
                    {preview.reminder_count ? ` · ${preview.reminder_count}× · nächste: ${reminderLevelLabel(preview.reminder_count)}` : ` · nächste: ${reminderLevelLabel(0)}`}
                    {preview.last_reminder_at ? ` · zuletzt ${new Date(preview.last_reminder_at).toLocaleString("de-DE")}` : ""}
                  </span>
                </div>
              )}
              {visibleInvoiceStatus(preview.status, preview.paid_at, preview.amount_paid, preview.total_amount) === "Bezahlt" ? (
                <div className="sendSuccess">
                  Als bezahlt markiert
                  {preview.paid_at ? ` · ${new Date(preview.paid_at).toLocaleString("de-DE")}` : ""}
                  {preview.payment_note ? ` · ${preview.payment_note}` : ""}
                  <div className="formActions" style={{ marginTop: 8 }}>
                    <button className="ghostBtn" type="button" disabled={busy} onClick={() => void undoPayment()}>
                      Zahlung zurücknehmen
                    </button>
                  </div>
                </div>
              ) : preview.status === "Entwurf" ? (
                <p className="cellSub">Entwurf. Bearbeiten oder löschen Sie ihn, bevor er als bezahlt markiert wird.</p>
              ) : (
                <div className="formActions" style={{ marginTop: 4, flexWrap: "wrap" }}>
                  {preview.status !== "Storniert" && preview.status !== "Stornorechnung" && invoiceRemainder(preview.total_amount, preview.amount_paid) > 0 && (
                    <>
                      <input
                        className="input"
                        inputMode="decimal"
                        placeholder="Teilbetrag"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        style={{ maxWidth: 140 }}
                      />
                      <button className="ghostBtn" type="button" disabled={busy} onClick={() => void recordPartial()}>
                        Teilzahlung buchen
                      </button>
                    </>
                  )}
                  <button className="primaryBtn" type="button" disabled={busy} onClick={markPaid}>
                    Als bezahlt markieren
                  </button>
                  {preview.status !== "Storniert" && Number(preview.total_amount) > 0 && (
                    <button className="ghostBtn" type="button" disabled={reminderBusy} onClick={openReminderDialog}>
                      {reminderLevelLabel(preview.reminder_count ?? 0)} vermerken
                    </button>
                  )}
                </div>
              )}
              {Number(preview.amount_paid || 0) > 0 && visibleInvoiceStatus(preview.status, preview.paid_at, preview.amount_paid, preview.total_amount) !== "Bezahlt" ? (
                <p className="cellSub" style={{ marginTop: 8 }}>
                  Bezahlt {euro(Number(preview.amount_paid))} · offen {euro(invoiceRemainder(preview.total_amount, preview.amount_paid))}
                </p>
              ) : null}
              {!["Bezahlt", "Entwurf", "Storniert", "Stornorechnung"].includes(visibleInvoiceStatus(preview.status, preview.paid_at, preview.amount_paid, preview.total_amount)) ? (
                <p className="cellSub" style={{ marginTop: 8 }}>
                  Nächste Stufe: {reminderLevelLabel(preview.reminder_count ?? 0)}
                  {preview.reminder_count ? ` · ${preview.reminder_count}× vermerkt` : ""}
                  {preview.last_reminder_at ? ` · zuletzt ${new Date(preview.last_reminder_at).toLocaleString("de-DE")}` : ""}
                </p>
              ) : null}
              {preview.job_id && (
                <p style={{ marginTop: 10 }}>
                  <Link className="textLink" href={`/techniker?job=${preview.job_id}`}>
                    Zugehörigen Auftrag öffnen →
                  </Link>
                </p>
              )}
            </div>
          )}

          {events.length > 0 && (
            <div className="docTimeline">
              <strong>Verlauf</strong>
              <ul>
                {events.map((ev) => (
                  <li key={ev.id}>
                    <span>{eventLabel(ev.event_type)}</span>
                    <small>{new Date(ev.created_at).toLocaleString("de-DE")}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="formActions docActionBar">
            <button className="ghostBtn" onClick={() => { setPreview(null); setReminderOpen(false); clearDocSearch(); }}>
              Schließen
            </button>
            {preview.status === "Entwurf" && (
              <>
                <button className="ghostBtn" type="button" disabled={busy} onClick={() => void openDraftEditor(preview)}>Bearbeiten</button>
                <button className="ghostBtn" type="button" disabled={busy} onClick={() => void deleteDraft(preview)}>Löschen</button>
              </>
            )}
            <button className="ghostBtn" onClick={downloadPdf}>
              PDF herunterladen
            </button>
            {config.type === "invoice" && (
              <button
                className="ghostBtn"
                type="button"
                disabled={!eInvoice?.ok}
                title={eInvoice?.ok ? "XML-Datei speichern" : "Dafür fehlt in den Firmendaten eine USt-IdNr. oder Steuernummer."}
                onClick={downloadEInvoiceXml}
              >
                E-Rechnung XML
              </button>
            )}
            {config.type === "invoice" && eInvoice && !eInvoice.ok && (
              <span className="cellSub">XML braucht eine USt-IdNr. oder Steuernummer in den Firmendaten.</span>
            )}
            <button className="ghostBtn" onClick={sharePdf}>
              Teilen
            </button>
            <button className="primaryBtn" onClick={openSendDialog}>
              ✉ Per E-Mail senden
            </button>
          </div>
        </Modal>
      )}

      {sendOpen && preview && (
        <Modal title={`${config.singular} senden`} subtitle={`${preview.document_number} als PDF-Anhang`} onClose={() => setSendOpen(false)}>
          <div className="emailSendForm">
            {sendError && <div className="loginError pageError">{sendError}</div>}
            {sendSuccess && <div className="sendSuccess">{sendSuccess}</div>}
            <div className="formField">
              <label>Empfänger</label>
              <input className="input" type="email" value={sendForm.to} onChange={(e) => setSendForm({ ...sendForm, to: e.target.value })} placeholder="kunde@example.de" />
            </div>
            <div className="formField">
              <label>Betreff</label>
              <input className="input" value={sendForm.subject} onChange={(e) => setSendForm({ ...sendForm, subject: e.target.value })} />
            </div>
            <div className="formField">
              <label>Nachricht</label>
              <textarea className="textarea" rows={8} value={sendForm.message} onChange={(e) => setSendForm({ ...sendForm, message: e.target.value })} />
            </div>
            <div className="emailHint">
              Absender: {senderEmail || "Registrierte E-Mail des Chef/Inhabers"}. Direktversand benötigt die Freischaltung dieses Postfachs bzw. seiner Firmendomain. Beim Teilen in der E-Mail-App bitte dieses Absenderkonto auswählen; dort wird die PDF angehängt. Bei „E-Mail vorbereiten“ bitte die heruntergeladene PDF selbst anhängen.
            </div>
            <div className="formActions">
              <button className="ghostBtn" type="button" onClick={sharePdf}>PDF mit E-Mail-App teilen</button>
              <button className="ghostBtn" type="button" onClick={prepareEmailFallback}>
                E-Mail vorbereiten
              </button>
              <button className="primaryBtn" type="button" disabled={sendBusy || !sendForm.to} onClick={sendEmail}>
                {sendBusy ? "Sendet..." : "Jetzt senden"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {reminderOpen && preview && reminderFallback && (
        <Modal
          title={reminderLevelLabel(preview.reminder_count ?? 0)}
          subtitle={`${preview.document_number} · wird im Verlauf vermerkt`}
          onClose={() => { setReminderOpen(false); clearDocSearch(); }}
        >
          <div className="emailSendForm">
            {reminderError && <div className="loginError pageError">{reminderError}</div>}
            {reminderInfo && <div className="sendSuccess" style={{ whiteSpace: "pre-wrap" }}>{reminderInfo}</div>}
            {isInvoiceOverdue(preview, today) && (
              <div className="overdueBanner">
                <strong>Überfällig</strong>
                <span>
                  {euro(invoiceRemainder(preview.total_amount, preview.amount_paid))} · fällig {preview.due_date ? formatDate(preview.due_date) : "—"}
                  {daysOverdue(preview.due_date, today) ? ` · ${daysOverdue(preview.due_date, today) === 1 ? "1 Tag" : `${daysOverdue(preview.due_date, today)} Tage`}` : ""}
                </span>
              </div>
            )}
            <div className="formField">
              <label>Empfänger (optional für E-Mail)</label>
              <input
                className="input"
                type="email"
                value={reminderFallback.to}
                onChange={(e) => setReminderFallback({ ...reminderFallback, to: e.target.value })}
                placeholder="kunde@example.de"
              />
            </div>
            <div className="formField">
              <label>Betreff</label>
              <input
                className="input"
                value={reminderFallback.subject}
                onChange={(e) => setReminderFallback({ ...reminderFallback, subject: e.target.value })}
              />
            </div>
            <div className="formField">
              <label>Mahnungstext (kopierbar)</label>
              <textarea
                className="textarea"
                rows={10}
                value={reminderFallback.body}
                onChange={(e) => setReminderFallback({ ...reminderFallback, body: e.target.value })}
              />
            </div>
            <div className="emailHint">
              Die Mahnung wird immer gespeichert. Sie können den Text kopieren, im E-Mail-Programm öffnen oder direkt über das verbundene Firmenpostfach senden.
            </div>
            <div className="formActions" style={{ flexWrap: "wrap" }}>
              <button className="ghostBtn" type="button" disabled={reminderBusy} onClick={logReminderOnly}>
                Nur vermerken
              </button>
              <button className="ghostBtn" type="button" disabled={reminderBusy} onClick={() => void downloadReminderPdf()}>
                PDF herunterladen
              </button>
              <button className="ghostBtn" type="button" disabled={reminderBusy} onClick={copyReminderText}>
                Text kopieren
              </button>
              <button className="ghostBtn" type="button" disabled={reminderBusy} onClick={mailtoReminder}>
                E-Mail-Programm öffnen
              </button>
              <button className="primaryBtn" type="button" disabled={reminderBusy} onClick={sendReminderEmail}>
                {reminderBusy ? "Bitte warten..." : "Per E-Mail senden"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
