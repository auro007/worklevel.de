"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";

type ResultKind =
  | "customer"
  | "job"
  | "document"
  | "lead"
  | "error_code"
  | "device"
  | "template"
  | "material"
  | "site";

type SearchResult = {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge: string;
};

type DocRow = {
  id: string;
  document_number: string;
  doc_type: string;
  status: string;
  title: string | null;
  customer_id: number | null;
};

type ErrorCodeRow = {
  id: string;
  code: string;
  title: string;
  trade_category: string | null;
  device_name: string | null;
};

type DeviceRow = {
  id: string;
  name: string;
  device_type: string;
  serial_number: string | null;
  model: string | null;
  customer_id: number | null;
};

type MaterialRow = {
  id: string;
  sku: string | null;
  name: string;
  unit: string | null;
};

type TemplateRow = {
  id: string;
  name: string;
  title: string | null;
  doc_type: string;
  active: boolean;
};

const KIND_LABEL: Record<ResultKind, string> = {
  customer: "Kunde",
  job: "Auftrag",
  document: "Dokument",
  lead: "Lead",
  error_code: "Fehlercode",
  device: "Gerät",
  template: "Vorlage",
  material: "Material",
  site: "Objekt",
};

const DOC_HREF: Record<string, string> = {
  offer: "/angebote",
  invoice: "/rechnungen",
  delivery_note: "/lieferscheine",
};

const DOC_LABEL: Record<string, string> = {
  offer: "Angebot",
  invoice: "Rechnung",
  delivery_note: "Lieferschein",
};

const TEMPLATE_LABEL: Record<string, string> = {
  offer: "Angebot",
  invoice: "Rechnung",
  delivery_note: "Lieferschein",
};

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function matches(hay: string, q: string) {
  return norm(hay).includes(q);
}

export default function GlobalSearch() {
  const router = useRouter();
  const { customers, customerSites, jobs, leads } = useAppData();
  const { company, role } = useCompany();
  const allowed = role === "owner" || role === "admin";
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [errorCodes, setErrorCodes] = useState<ErrorCodeRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!allowed) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [allowed]);

  useEffect(() => {
    let cancelled = false;
    async function loadExtras() {
      if (!allowed || !company || debounced.length < 2) {
        setDocs([]);
        setErrorCodes([]);
        setDevices([]);
        setTemplates([]);
        setMaterials([]);
        setExtraLoading(false);
        return;
      }
      const s = getSupabaseClient();
      if (!s) {
        setDocs([]);
        setErrorCodes([]);
        setDevices([]);
        setTemplates([]);
        setMaterials([]);
        return;
      }
      setExtraLoading(true);
      const safe = debounced.replace(/[%_,]/g, "").slice(0, 60);
      if (!safe) {
        setDocs([]);
        setErrorCodes([]);
        setDevices([]);
        setTemplates([]);
        setMaterials([]);
        setExtraLoading(false);
        return;
      }
      const [docsRes, codesRes, devicesRes, templatesRes, materialsRes] = await Promise.all([
        s
          .from("documents")
          .select("id,document_number,doc_type,status,title,customer_id")
          .eq("company_id", company.id)
          .ilike("document_number", `%${safe}%`)
          .limit(12),
        s
          .from("error_codes")
          .select("id,code,title,trade_category,device_name")
          .eq("company_id", company.id)
          .or(`code.ilike.%${safe}%,title.ilike.%${safe}%,device_name.ilike.%${safe}%`)
          .limit(8),
        s
          .from("site_devices")
          .select("id,name,device_type,serial_number,model,customer_id")
          .eq("company_id", company.id)
          .or(`name.ilike.%${safe}%,device_type.ilike.%${safe}%,serial_number.ilike.%${safe}%,model.ilike.%${safe}%`)
          .limit(8),
        s
          .from("document_templates")
          .select("id,name,title,doc_type,active")
          .eq("company_id", company.id)
          .or(`name.ilike.%${safe}%,title.ilike.%${safe}%`)
          .limit(8),
        s
          .from("inventory_materials")
          .select("id,sku,name,unit")
          .eq("company_id", company.id)
          .eq("active", true)
          .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`)
          .limit(10),
      ]);
      if (!cancelled) {
        setDocs((docsRes.data as DocRow[]) ?? []);
        setErrorCodes((codesRes.data as ErrorCodeRow[]) ?? []);
        setDevices((devicesRes.data as DeviceRow[]) ?? []);
        setTemplates((templatesRes.data as TemplateRow[]) ?? []);
        setMaterials((materialsRes.data as MaterialRow[]) ?? []);
        setExtraLoading(false);
      }
    }
    loadExtras();
    return () => {
      cancelled = true;
    };
  }, [debounced, company?.id, allowed]);

  const results = useMemo(() => {
    if (!allowed) return [] as SearchResult[];
    const q = norm(debounced);
    if (q.length < 2) return [] as SearchResult[];
    const out: SearchResult[] = [];

    for (const c of customers) {
      const address = `${c.street} ${c.postalCode} ${c.city}`;
      const hay = `${c.name} ${c.contact} ${c.phone} ${c.email} ${address} ${c.number}`;
      if (!matches(hay, q)) continue;
      out.push({
        kind: "customer",
        id: c.id,
        title: c.name || "Kunde",
        subtitle: [c.number, c.phone || c.email, [c.postalCode, c.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(" · "),
        href: "/kunden",
        badge: KIND_LABEL.customer,
      });
      if (out.filter((r) => r.kind === "customer").length >= 6) break;
    }

    for (const site of customerSites) {
      const customer = customers.find((c) => c.id === site.customerId);
      const address = `${site.street} ${site.postalCode} ${site.city}`;
      const hay = `${site.name} ${address} ${site.tenantName} ${site.tenantPhone} ${site.tenantEmail} ${customer?.name ?? ""}`;
      if (!matches(hay, q)) continue;
      out.push({
        kind: "site",
        id: site.id,
        title: site.name || "Objekt",
        subtitle: [customer?.name, [site.postalCode, site.city].filter(Boolean).join(" "), site.active ? null : "inaktiv"]
          .filter(Boolean)
          .join(" · "),
        href: "/kunden",
        badge: KIND_LABEL.site,
      });
      if (out.filter((r) => r.kind === "site").length >= 6) break;
    }

    for (const j of jobs) {
      const c = customers.find((x) => x.id === j.customerId);
      const hay = `${j.number} ${j.title} ${j.address} ${j.description} ${j.status} ${c?.name ?? ""} ${c?.phone ?? ""}`;
      if (!matches(hay, q)) continue;
      out.push({
        kind: "job",
        id: j.id,
        title: `${j.number ? j.number + " · " : ""}${j.title}`,
        subtitle: [c?.name, j.date, j.status].filter(Boolean).join(" · "),
        href: "/auftraege",
        badge: KIND_LABEL.job,
      });
      if (out.filter((r) => r.kind === "job").length >= 6) break;
    }

    for (const d of docs) {
      const c = customers.find((x) => x.id === String(d.customer_id));
      const typeLabel = DOC_LABEL[d.doc_type] ?? "Dokument";
      out.push({
        kind: "document",
        id: d.id,
        title: d.document_number || typeLabel,
        subtitle: [typeLabel, d.status, d.title, c?.name].filter(Boolean).join(" · "),
        href: DOC_HREF[d.doc_type] ?? "/angebote",
        badge: typeLabel,
      });
    }

    for (const l of leads) {
      const address = `${l.street} ${l.postalCode} ${l.city}`;
      const hay = `${l.name} ${l.company} ${l.phone} ${l.email} ${address} ${l.source} ${l.status}`;
      if (!matches(hay, q)) continue;
      out.push({
        kind: "lead",
        id: l.id,
        title: l.name || l.company || "Lead",
        subtitle: [l.company, l.phone || l.email, l.status].filter(Boolean).join(" · "),
        href: "/leads",
        badge: KIND_LABEL.lead,
      });
      if (out.filter((r) => r.kind === "lead").length >= 6) break;
    }

    for (const ec of errorCodes) {
      out.push({
        kind: "error_code",
        id: ec.id,
        title: `${ec.code}${ec.title ? " · " + ec.title : ""}`,
        subtitle: [ec.device_name, ec.trade_category, KIND_LABEL.error_code].filter(Boolean).join(" · "),
        href: "/fehlercodes",
        badge: KIND_LABEL.error_code,
      });
    }

    for (const d of devices) {
      const c = customers.find((x) => x.id === String(d.customer_id));
      out.push({
        kind: "device",
        id: d.id,
        title: d.name || "Gerät",
        subtitle: [d.device_type, d.model || d.serial_number, c?.name].filter(Boolean).join(" · "),
        href: "/geraete",
        badge: KIND_LABEL.device,
      });
    }

    for (const m of materials) {
      out.push({
        kind: "material",
        id: m.id,
        title: m.name || "Material",
        subtitle: [m.sku, m.unit].filter(Boolean).join(" · "),
        href: "/material",
        badge: KIND_LABEL.material,
      });
    }

    for (const t of templates) {
      const typeLabel = TEMPLATE_LABEL[t.doc_type] ?? "Vorlage";
      out.push({
        kind: "template",
        id: t.id,
        title: t.name || t.title || "Vorlage",
        subtitle: [typeLabel, t.title, t.active ? null : "inaktiv"].filter(Boolean).join(" · "),
        href: "/vorlagen",
        badge: KIND_LABEL.template,
      });
    }

    return out.slice(0, 24);
  }, [allowed, debounced, customers, customerSites, jobs, leads, docs, errorCodes, devices, templates, materials]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setDebounced("");
      router.push(href);
    },
    [router]
  );

  if (!allowed) return null;

  const showPanel = open && debounced.length >= 2;

  return (
    <div className="globalSearch" ref={rootRef}>
      <div className="globalSearchField">
        <span className="globalSearchIcon" aria-hidden>
          ⌕
        </span>
        <input
          ref={inputRef}
          className="globalSearchInput"
          type="search"
          placeholder="Suche: Kunden, Aufträge, Rechnungen, Material, Geräte..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label="Globale Suche"
          autoComplete="off"
        />
        <kbd className="globalSearchKbd">Ctrl K</kbd>
      </div>
      {showPanel && (
        <div className="globalSearchPanel" role="listbox">
          {extraLoading && results.length === 0 && (
            <div className="globalSearchEmpty">Suche läuft…</div>
          )}
          {!extraLoading && results.length === 0 && (
            <div className="globalSearchEmpty">Keine Treffer für „{debounced}“</div>
          )}
          {results.length > 0 && (
            <ul className="globalSearchList">
              {results.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <button
                    type="button"
                    className="globalSearchItem"
                    onClick={() => go(r.href)}
                    role="option"
                  >
                    <span className={`globalSearchBadge kind-${r.kind}`}>{r.badge}</span>
                    <span className="globalSearchText">
                      <strong>{r.title}</strong>
                      {r.subtitle && <span>{r.subtitle}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
