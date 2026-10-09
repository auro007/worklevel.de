"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, Modal } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";
import type { CustomerSite } from "@/lib/types";
import { formatCloudError } from "@/lib/utils";
import { useConfirm } from "@/components/ConfirmProvider";

const blank = { number: "", name: "", contact: "", street: "", postalCode: "", city: "", phone: "", email: "", notes: "" };
const blankSite = { name: "", street: "", postalCode: "", city: "", tenantName: "", tenantPhone: "", tenantEmail: "", notes: "" };
const pageSizes = [10, 25, 50, 100];

const columns = [
  ["kind", "Typ"],
  ["number", "Kundennummer"],
  ["company", "Firmenname"],
  ["firstName", "Vorname"],
  ["lastName", "Nachname"],
  ["email", "E-Mail"],
  ["category", "Kategorie"],
  ["city", "Ort"],
] as const;

type ColumnKey = (typeof columns)[number][0];
type Tab = "alle" | "kunden" | "lieferanten" | "partner" | "ansprechpartner" | "archiv";
type Kind = "Kunde" | "Lieferant" | "Ansprechpartner";

type ContactRow = {
  id: string;
  kind: Kind;
  number: string;
  company: string;
  firstName: string;
  lastName: string;
  email: string;
  category: string;
  city: string;
  street: string;
  postalCode: string;
  phone: string;
  customerId?: string;
};

type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  city: string | null;
  active: boolean;
};

const tabs: { id: Tab; label: string }[] = [
  { id: "alle", label: "ALLE" },
  { id: "kunden", label: "KUNDEN" },
  { id: "lieferanten", label: "LIEFERANTEN" },
  { id: "partner", label: "PARTNER" },
  { id: "ansprechpartner", label: "ANSPRECHPARTNER" },
  { id: "archiv", label: "ARCHIV" },
];

const emptyFilters: Record<ColumnKey, string> = {
  kind: "",
  number: "",
  company: "",
  firstName: "",
  lastName: "",
  email: "",
  category: "",
  city: "",
};

function siteAddress(s: Pick<CustomerSite, "street" | "postalCode" | "city">) {
  return [s.street, [s.postalCode, s.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

function splitPerson(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function includes(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function CustomersPage() {
  const {
    customers,
    customerSites,
    addCustomer,
    updateCustomer,
    removeCustomer,
    addCustomerSite,
    updateCustomerSite,
    removeCustomerSite,
    cloudLoading,
    cloudError,
  } = useAppData();
  const { company } = useCompany();
  const ask = useConfirm();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierError, setSupplierError] = useState("");
  const [tab, setTab] = useState<Tab>("alle");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "alle" || requested === "kunden" || requested === "lieferanten" || requested === "partner" || requested === "ansprechpartner" || requested === "archiv") {
      setTab(requested);
    }
  }, []);
  const [draft, setDraft] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [sortKey, setSortKey] = useState<ColumnKey>("company");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [menu, setMenu] = useState<"group" | "export" | "columns" | null>(null);
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>({
    kind: true, number: true, company: true, firstName: true, lastName: true, email: true, category: true, city: true,
  });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [customerDocs, setCustomerDocs] = useState<Array<{ id: string; document_number: string; doc_type: string; status: string; total_amount: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteEditId, setSiteEditId] = useState<string | null>(null);
  const [siteCustomerId, setSiteCustomerId] = useState("");
  const [siteForm, setSiteForm] = useState(blankSite);
  const [siteSaving, setSiteSaving] = useState(false);
  const [phoneQuery, setPhoneQuery] = useState("");

  useEffect(() => {
    if (!expandedId || !company) { setCustomerDocs([]); return; }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let cancelled = false;
    void supabase
      .from("documents")
      .select("id,document_number,doc_type,status,total_amount")
      .eq("company_id", company.id)
      .eq("customer_id", Number(expandedId))
      .order("issue_date", { ascending: false })
      .limit(12)
      .then(({ data }) => { if (!cancelled) setCustomerDocs((data ?? []) as typeof customerDocs); });
    return () => { cancelled = true; };
  }, [expandedId, company?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadSuppliers() {
      const supabase = getSupabaseClient();
      if (!supabase || !company) {
        setSuppliers([]);
        return;
      }
      const result = await supabase
        .from("suppliers")
        .select("id,name,contact_name,email,city,active")
        .eq("company_id", company.id)
        .order("name");
      if (cancelled) return;
      if (result.error) setSupplierError(formatCloudError(result.error.message));
      else {
        setSupplierError("");
        setSuppliers((result.data ?? []) as Supplier[]);
      }
    }
    loadSuppliers();
    return () => {
      cancelled = true;
    };
  }, [company?.id]);

  const rows = useMemo(() => {
    const people: ContactRow[] = [];
    const customerRows: ContactRow[] = customers.map((customer) => {
      const person = splitPerson(customer.contact || "");
      if (customer.contact.trim()) {
        people.push({
          id: `contact-${customer.id}`,
          kind: "Ansprechpartner",
          number: customer.number,
          company: customer.name,
          firstName: person.firstName,
          lastName: person.lastName,
          email: customer.email,
          category: "Ansprechpartner",
          city: customer.city,
          street: customer.street,
          postalCode: customer.postalCode,
          phone: customer.phone,
          customerId: customer.id,
        });
      }
      return {
        id: customer.id,
        kind: "Kunde" as const,
        number: customer.number,
        company: customer.name,
        firstName: person.firstName,
        lastName: person.lastName,
        email: customer.email,
        category: customer.archived ? "Archiv" : "Kunde",
        city: customer.city,
        street: customer.street,
        postalCode: customer.postalCode,
        phone: customer.phone,
        customerId: customer.id,
      };
    });
    for (const site of customerSites) {
      if (!site.tenantName.trim()) continue;
      const customer = customers.find((item) => item.id === site.customerId);
      const person = splitPerson(site.tenantName);
      people.push({
        id: `tenant-${site.id}`,
        kind: "Ansprechpartner",
        number: customer?.number || "",
        company: customer?.name || site.name,
        firstName: person.firstName,
        lastName: person.lastName,
        email: site.tenantEmail,
        category: site.active ? "Mieter" : "Archiv",
        city: site.city,
        street: site.street,
        postalCode: site.postalCode,
        phone: site.tenantPhone,
        customerId: site.customerId,
      });
    }
    const supplierRows: ContactRow[] = suppliers.map((supplier) => {
      const person = splitPerson(supplier.contact_name || "");
      return {
        id: `supplier-${supplier.id}`,
        kind: "Lieferant",
        number: "",
        company: supplier.name,
        firstName: person.firstName,
        lastName: person.lastName,
        email: supplier.email || "",
        category: supplier.active ? "Lieferant" : "Archiv",
        city: supplier.city || "",
        street: "",
        postalCode: "",
        phone: "",
      };
    });
    return { customerRows, people, supplierRows };
  }, [customers, customerSites, suppliers]);

  const tabRows = useMemo(() => {
    const activeSuppliers = rows.supplierRows.filter((row) => row.category !== "Archiv");
    const activeCustomers = rows.customerRows.filter((row) => row.category !== "Archiv");
    const archived = [
      ...rows.customerRows.filter((row) => row.category === "Archiv"),
      ...rows.supplierRows.filter((row) => row.category === "Archiv"),
      ...rows.people.filter((row) => row.category === "Archiv"),
    ];
    if (tab === "kunden") return activeCustomers;
    if (tab === "lieferanten") return activeSuppliers;
    if (tab === "ansprechpartner") return rows.people.filter((row) => row.category !== "Archiv");
    if (tab === "archiv") return archived;
    if (tab === "partner") return [];
    return [
      ...activeCustomers,
      ...activeSuppliers,
      ...rows.people.filter((row) => row.category !== "Archiv"),
    ];
  }, [rows, tab]);

  const filtered = useMemo(() => {
    const next = tabRows.filter((row) =>
      columns.every(([key]) => !applied[key] || includes(row[key], applied[key]))
    );
    next.sort((a, b) => {
      const result = a[sortKey].localeCompare(b[sortKey], "de", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? result : -result;
    });
    return next;
  }, [tabRows, applied, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const shownColumns = columns.filter(([key]) => visible[key]);
  const selectedCustomers = selected.filter((id) => rows.customerRows.some((row) => row.id === id));

  function rangeLabel() {
    if (filtered.length === 0) return "Keine passenden Einträge gefunden";
    const start = safePage * pageSize + 1;
    const end = Math.min(filtered.length, start + pageSize - 1);
    return `${start} bis ${end} von ${filtered.length} Einträgen`;
  }

  function search(event?: FormEvent) {
    event?.preventDefault();
    setApplied(draft);
    setPage(0);
    setMenu(null);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setPage(0);
  }

  function toggleSort(key: ColumnKey) {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleRow(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function exportCsv() {
    const header = [...shownColumns.map(([, label]) => label), "Straße", "PLZ", "Telefon"];
    const lines = [header, ...filtered.map((row) => [...shownColumns.map(([key]) => row[key]), row.street, row.postalCode, row.phone])];
    const csv = lines.map((line) => line.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "kontakte.csv";
    link.click();
    URL.revokeObjectURL(url);
    setMenu(null);
  }

  function openEdit(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    setEditingId(customer.id);
    setForm({
      number: customer.number,
      name: customer.name,
      contact: customer.contact,
      street: customer.street,
      postalCode: customer.postalCode,
      city: customer.city,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes ?? "",
    });
    setOpen(true);
    setMenu(null);
  }

  async function archiveCustomer(customerId: string) {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    const next = !customer.archived;
    if (!confirm(next ? `„${customer.name}“ archivieren? Dokumente bleiben erhalten.` : `„${customer.name}“ wieder in die aktive Liste holen?`)) return;
    await updateCustomer(customerId, { archived: next });
    setMenu(null);
  }

  async function deleteSelected() {
    if (selectedCustomers.length === 0) return;
    if (!(await ask(`${selectedCustomers.length} ausgewählte Kunden löschen? Zugehörige Aufträge müssen vorher gelöscht werden.`, "Löschen"))) return;
    for (const id of selectedCustomers) {
      const ok = await removeCustomer(id);
      if (!ok) {
        if (await ask("Löschen ist nicht möglich, weil Dokumente an diesem Kunden hängen. Stattdessen archivieren?", "Archivieren")) {
          await updateCustomer(id, { archived: true });
        }
        break;
      }
    }
    setSelected([]);
    setMenu(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!editingId) {
      const name = form.name.trim().toLowerCase();
      const mail = form.email.trim().toLowerCase();
      const duplicate = customers.find((customer) => !customer.archived && (customer.name.trim().toLowerCase() === name || (mail && customer.email.trim().toLowerCase() === mail)));
      if (duplicate && !(await ask(`Es gibt schon „${duplicate.name}“${duplicate.email ? ` (${duplicate.email})` : ""}. Trotzdem einen weiteren Kunden anlegen?`, "Trotzdem anlegen"))) return;
    }
    setSaving(true);
    const ok = editingId
      ? await updateCustomer(editingId, form)
      : await addCustomer({ ...form, number: form.number || `KD-${1001 + customers.length}` });
    if (ok) {
      setOpen(false);
      setEditingId(null);
      setForm(blank);
      if (!editingId) setTab("kunden");
    }
    setSaving(false);
  }

  function openNewSite(customerId: string) {
    const existing = customerSites.filter((site) => site.customerId === customerId);
    setSiteCustomerId(customerId);
    setSiteEditId(null);
    setSiteForm({ ...blankSite, name: `Haus ${existing.length + 1}` });
    setSiteOpen(true);
    setMenu(null);
  }

  function openEditSite(site: CustomerSite) {
    setSiteCustomerId(site.customerId);
    setSiteEditId(site.id);
    setSiteForm({
      name: site.name,
      street: site.street,
      postalCode: site.postalCode,
      city: site.city,
      tenantName: site.tenantName,
      tenantPhone: site.tenantPhone,
      tenantEmail: site.tenantEmail,
      notes: site.notes ?? "",
    });
    setSiteOpen(true);
  }

  async function submitSite(e: FormEvent) {
    e.preventDefault();
    if (!siteForm.name.trim() || !siteCustomerId) return;
    setSiteSaving(true);
    const ok = siteEditId
      ? await updateCustomerSite(siteEditId, { ...siteForm })
      : await addCustomerSite({ customerId: siteCustomerId, ...siteForm, active: true });
    if (ok) {
      setSiteOpen(false);
      setSiteForm(blankSite);
      setExpandedId(siteCustomerId);
    }
    setSiteSaving(false);
  }

  async function deactivateSite(site: CustomerSite) {
    if (!confirm(`Objekt „${site.name}“ deaktivieren? Bestehende Aufträge behalten den Bezug.`)) return;
    await removeCustomerSite(site.id);
  }

  function Pager({ foot }: { foot?: boolean }) {
    return (
      <div className={foot ? "contactsToolbar contactsFoot" : "contactsToolbar"}>
        <div className="contactsPager">
          <span>Zeige</span>
          <select
            className="contactsSelect"
            aria-label="Einträge pro Seite"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
          >
            {pageSizes.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <span>Einträge</span>
          <span className="contactsMuted">{rangeLabel()}</span>
          <span className="contactsHint">Klicken, um Zeilen auszuwählen</span>
          {filtered.length > pageSize && (
            <span className="contactsPageBtns">
              <button type="button" aria-label="Vorherige Seite" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹</button>
              <button type="button" aria-label="Nächste Seite" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>›</button>
            </span>
          )}
        </div>
        {!foot && (
          <div className="contactsTools">
            <div className="contactsMenuWrap">
              <button type="button" className="contactsToolBtn" disabled={selected.length === 0} onClick={() => setMenu(menu === "group" ? null : "group")}>
                Gruppenaktion
              </button>
              {menu === "group" && (
                <div className="contactsPopover">
                  <button type="button" disabled={selectedCustomers.length !== 1} onClick={() => selectedCustomers[0] && openEdit(selectedCustomers[0])}>
                    Kunde bearbeiten
                  </button>
                  <button type="button" disabled={selectedCustomers.length !== 1} onClick={() => selectedCustomers[0] && archiveCustomer(selectedCustomers[0])}>
                    Archivieren / wiederherstellen
                  </button>
                  <button type="button" disabled={selectedCustomers.length === 0} onClick={deleteSelected}>
                    Kunden löschen ({selectedCustomers.length})
                  </button>
                  <button type="button" disabled={selectedCustomers.length !== 1} onClick={() => selectedCustomers[0] && openNewSite(selectedCustomers[0])}>
                    Objekt hinzufügen
                  </button>
                </div>
              )}
            </div>
            <div className="contactsMenuWrap">
              <button type="button" className="contactsToolBtn" onClick={() => setMenu(menu === "export" ? null : "export")}>Export</button>
              {menu === "export" && (
                <div className="contactsPopover">
                  <button type="button" onClick={exportCsv}>CSV exportieren</button>
                </div>
              )}
            </div>
            <div className="contactsMenuWrap">
              <button type="button" className="contactsIconBtn" aria-label="Spalten" onClick={() => setMenu(menu === "columns" ? null : "columns")}>≡</button>
              {menu === "columns" && (
                <div className="contactsPopover">
                  {columns.map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={visible[key]}
                        onChange={() => setVisible((current) => ({ ...current, [key]: !current[key] }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="page contactsPage">
      {(cloudError || supplierError) && <div className="loginError pageError">{cloudError || supplierError}</div>}
      <div className="phoneCustomers phoneOnly">
        <div className="phoneSectionHead">
          <h1>Kunden</h1>
          <button type="button" className="phoneAdd" onClick={() => { setEditingId(null); setForm(blank); setOpen(true); }}>+ Neu</button>
        </div>
        <label className="phoneSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={phoneQuery} onChange={(event) => setPhoneQuery(event.target.value)} placeholder="Kunde suchen" />
        </label>
        {cloudLoading ? <div className="phoneEmpty">Kunden werden geladen…</div> : customers.filter((customer) => !customer.archived && `${customer.name} ${customer.city} ${customer.phone} ${customer.contact}`.toLowerCase().includes(phoneQuery.trim().toLowerCase())).length === 0 ? <div className="phoneEmpty">Keine Kunden gefunden.</div> : customers.filter((customer) => !customer.archived && `${customer.name} ${customer.city} ${customer.phone} ${customer.contact}`.toLowerCase().includes(phoneQuery.trim().toLowerCase())).map((customer) => {
          const sites = customerSites.filter((site) => site.customerId === customer.id);
          const openSites = expandedId === customer.id;
          return (
            <div className="phoneCustomer" key={customer.id}>
              <button type="button" className="phoneCustomerMain" onClick={() => setExpandedId(openSites ? null : customer.id)}>
                <strong>{customer.name}</strong>
                <span>{[customer.postalCode, customer.city].filter(Boolean).join(" ") || customer.phone || "Keine Adresse"}</span>
                <span className="phoneChevron" aria-hidden="true">›</span>
              </button>
              {openSites && (
                <div className="phoneSites">
                  {sites.length === 0 ? <p>Noch keine Objekte.</p> : sites.map((site) => (
                    <p key={site.id}><b>{site.name}</b>{siteAddress(site) ? ` · ${siteAddress(site)}` : ""}</p>
                  ))}
                  <button type="button" onClick={() => openEdit(customer.id)}>Bearbeiten</button>
                  <button type="button" onClick={() => openNewSite(customer.id)}>+ Haus hinzufügen</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <section className="contactsBoard deskOnly">
        <div className="contactsHead">
          <h1>Kontakte</h1>
          <button type="button" className="contactsAdd" onClick={() => { setEditingId(null); setForm(blank); setOpen(true); }}>+ Kontakt</button>
        </div>
        <div className="contactsTabs" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "contactsTab active" : "contactsTab"}
              onClick={() => {
                setTab(item.id);
                setPage(0);
                setSelected([]);
                setMenu(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Pager />
        <div className="contactsScroll">
          {cloudLoading ? (
            <LoadingState label="Kontakte werden geladen…" />
          ) : (
            <form onSubmit={search}>
              <table className="contactsTable">
                <thead>
                  <tr>
                    {shownColumns.map(([key, label]) => (
                      <th key={key}>
                        <button type="button" className="contactsSort" onClick={() => toggleSort(key)}>
                          {label}
                          <i>{sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</i>
                        </button>
                      </th>
                    ))}
                    <th />
                  </tr>
                  <tr className="contactsFilter">
                    {shownColumns.map(([key, label]) => (
                      <td key={key}>
                        {key === "kind" || key === "category" ? (
                          <select aria-label={label} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}>
                            <option value="">Alle</option>
                            {(key === "kind" ? ["Kunde", "Lieferant", "Ansprechpartner"] : ["Kunde", "Lieferant", "Ansprechpartner", "Mieter", "Archiv"]).map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <input aria-label={label} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
                        )}
                      </td>
                    ))}
                    <td>
                      <div className="contactsSearch">
                        <button type="submit" className="contactsSearchBtn">Suchen</button>
                        <button type="button" className="contactsClear" aria-label="Filter leeren" onClick={clearFilters}>×</button>
                      </div>
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td className="contactsEmpty" colSpan={shownColumns.length + 1}>Keine passenden Einträge gefunden</td>
                    </tr>
                  ) : visibleRows.map((row) => {
                    const sites = row.customerId ? customerSites.filter((site) => site.customerId === row.customerId) : [];
                    const expanded = row.kind === "Kunde" && expandedId === row.customerId;
                    return (
                      <Fragment key={row.id}>
                        <tr className={selected.includes(row.id) ? "contactsData contactsSelected" : "contactsData"} onClick={() => toggleRow(row.id)}>
                          {shownColumns.map(([key]) => (
                            <td key={key}>
                              {key === "company" && row.customerId && row.kind === "Kunde" ? (
                                <button
                                  type="button"
                                  className="contactsNameBtn"
                                  title="Objekte anzeigen"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setExpandedId(expanded ? null : row.customerId || null);
                                  }}
                                >
                                  {row.company || "—"}
                                </button>
                              ) : (
                                row[key] || "—"
                              )}
                            </td>
                          ))}
                          <td />
                        </tr>
                        {expanded && row.customerId && (
                          <tr className="siteExpandRow">
                            <td colSpan={shownColumns.length + 1}>
                              <div className="siteExpandPanel" onClick={(event) => event.stopPropagation()}>
                                <div className="siteExpandHead">
                                  <div>
                                    <strong>{row.company}</strong>
                                    <span className="cellSub">
                                      {[customers.find((item) => item.id === row.customerId)?.street, [customers.find((item) => item.id === row.customerId)?.postalCode, customers.find((item) => item.id === row.customerId)?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Keine Rechnungsadresse"}
                                      {row.email ? ` · ${row.email}` : ""}
                                    </span>
                                  </div>
                                  <div className="rowActions">
                                    <button type="button" className="contactsToolBtn" onClick={() => openEdit(row.customerId!)}>Bearbeiten</button>
                                    <button type="button" className="contactsToolBtn" onClick={() => archiveCustomer(row.customerId!)}>{row.category === "Archiv" ? "Wiederherstellen" : "Archivieren"}</button>
                                    <button type="button" className="contactsToolBtn" onClick={() => openNewSite(row.customerId!)}>+ Haus</button>
                                  </div>
                                </div>
                                {customerDocs.length > 0 && (
                                  <p className="cellSub">
                                    Dokumente: {customerDocs.map((doc) => `${doc.document_number} (${doc.status})`).join(" · ")}
                                  </p>
                                )}
                                <div className="siteExpandHead">
                                  <div>
                                    <strong>Objekte / Häuser</strong>
                                    <span className="cellSub">Einsatzort und Mieter — Rechnung bleibt bei „{row.company}“</span>
                                  </div>
                                </div>
                                {sites.length === 0 ? (
                                  <EmptyState title="Noch keine Objekte" hint="Zum Beispiel Haus 1 oder Haus 2, mit Mieter-Telefon für den Einsatz vor Ort." />
                                ) : (
                                  <div className="siteCards">
                                    {sites.map((site) => (
                                      <div key={site.id} className={site.active ? "siteCard" : "siteCard siteCardInactive"}>
                                        <div className="siteCardTop">
                                          <strong>{site.name}</strong>
                                          {!site.active && <span className="siteInactiveBadge">Inaktiv</span>}
                                        </div>
                                        <p className="siteCardAddr">{siteAddress(site) || "Keine Adresse"}</p>
                                        <p className="siteCardTenant">
                                          <span>Mieter:</span> {site.tenantName || "—"}
                                          {site.tenantPhone ? ` · ${site.tenantPhone}` : ""}
                                          {site.tenantEmail ? ` · ${site.tenantEmail}` : ""}
                                        </p>
                                        {site.notes ? <p className="siteCardNotes">{site.notes}</p> : null}
                                        <div className="rowActions">
                                          <button type="button" className="textLink" onClick={() => openEditSite(site)}>Bearbeiten</button>
                                          {site.active ? (
                                            <button type="button" className="dangerLink" onClick={() => deactivateSite(site)}>Deaktivieren</button>
                                          ) : (
                                            <button type="button" className="textLink" onClick={() => updateCustomerSite(site.id, { active: true })}>Reaktivieren</button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </form>
          )}
        </div>
        <Pager foot />
      </section>

      {open && (
        <Modal title={editingId ? "Kunde bearbeiten" : "Neuer Kontakt"} subtitle="Kunde mit Rechnungsadresse — Objekte später ergänzen" onClose={() => { setOpen(false); setEditingId(null); }}>
          <form onSubmit={submit}>
            <div className="formGrid">
              <div className="formField">
                <label>Kundennummer</label>
                <input className="input" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="Automatisch, wenn leer" />
              </div>
              <div className="formField">
                <label>Firma / Kundenname *</label>
                <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="formField">
                <label>Ansprechpartner</label>
                <input className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Vorname Nachname" />
              </div>
              <div className="formField">
                <label>Telefon</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>Straße + Hausnummer (Rechnung)</label>
                <input className="input" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
              </div>
              <div className="formField">
                <label>PLZ</label>
                <input className="input" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
              </div>
              <div className="formField">
                <label>Ort</label>
                <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>E-Mail</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>Notizen</label>
                <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="formActions">
              <button type="button" className="ghostBtn" onClick={() => { setOpen(false); setEditingId(null); }}>Abbrechen</button>
              <button className="primaryBtn" disabled={saving}>{saving ? "Speichert..." : "Kontakt speichern"}</button>
            </div>
          </form>
        </Modal>
      )}

      {siteOpen && (
        <Modal
          title={siteEditId ? "Objekt bearbeiten" : "Neues Objekt / Haus"}
          subtitle="Einsatzort und Mieter — Rechnung bleibt beim Kunden"
          onClose={() => setSiteOpen(false)}
        >
          <form onSubmit={submitSite}>
            <div className="formGrid">
              <div className="formField">
                <label>Bezeichnung *</label>
                <input className="input" required value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} placeholder="z.B. Haus 1" />
              </div>
              <div className="formField">
                <label>Mieter Name</label>
                <input className="input" value={siteForm.tenantName} onChange={(e) => setSiteForm({ ...siteForm, tenantName: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>Straße + Hausnummer (Einsatzort)</label>
                <input className="input" value={siteForm.street} onChange={(e) => setSiteForm({ ...siteForm, street: e.target.value })} />
              </div>
              <div className="formField">
                <label>PLZ</label>
                <input className="input" value={siteForm.postalCode} onChange={(e) => setSiteForm({ ...siteForm, postalCode: e.target.value })} />
              </div>
              <div className="formField">
                <label>Ort</label>
                <input className="input" value={siteForm.city} onChange={(e) => setSiteForm({ ...siteForm, city: e.target.value })} />
              </div>
              <div className="formField">
                <label>Mieter Telefon</label>
                <input className="input" value={siteForm.tenantPhone} onChange={(e) => setSiteForm({ ...siteForm, tenantPhone: e.target.value })} />
              </div>
              <div className="formField">
                <label>Mieter E-Mail</label>
                <input className="input" type="email" value={siteForm.tenantEmail} onChange={(e) => setSiteForm({ ...siteForm, tenantEmail: e.target.value })} />
              </div>
              <div className="formField wide">
                <label>Notizen zum Objekt</label>
                <textarea className="textarea" value={siteForm.notes} onChange={(e) => setSiteForm({ ...siteForm, notes: e.target.value })} placeholder="Zugangscode, Keller, …" />
              </div>
            </div>
            <div className="formActions">
              <button type="button" className="ghostBtn" onClick={() => setSiteOpen(false)}>Abbrechen</button>
              <button className="primaryBtn" disabled={siteSaving}>{siteSaving ? "Speichert..." : siteEditId ? "Objekt speichern" : "Objekt anlegen"}</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
