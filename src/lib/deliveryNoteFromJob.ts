import { getSupabaseClient } from "@/lib/supabase";

export type DeliveryNoteFromJobResult = {
  id: string;
  document_number: string;
  already_existed: boolean;
  material_count: number;
};

/** Owner/admin: draft Lieferschein from job_materials via create_business_document (no new SQL). */
export async function prepareDeliveryNoteFromJob(jobId: string): Promise<DeliveryNoteFromJobResult> {
  const s = getSupabaseClient();
  if (!s) throw new Error("Supabase ist nicht verfügbar.");

  const { data: job, error: jobErr } = await s
    .from("jobs")
    .select("id,company_id,customer_id,job_number,title,description")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) throw new Error(jobErr.message);
  if (!job) throw new Error("Auftrag nicht gefunden.");
  if (job.customer_id == null) throw new Error("Auftrag hat keinen Kunden.");

  // Idempotent: reuse open draft/open delivery note for this job
  const { data: existing, error: exErr } = await s
    .from("documents")
    .select("id,document_number,status")
    .eq("job_id", job.id)
    .eq("doc_type", "delivery_note")
    .neq("status", "Storniert")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);
  const { data: company, error: coErr } = await s
    .from("companies")
    .select("id,default_vat_rate,taxation_mode,hourly_rate")
    .eq("id", job.company_id)
    .maybeSingle();
  if (coErr) throw new Error(coErr.message);
  if (!company) throw new Error("Firma nicht gefunden.");

  const taxMode = (company.taxation_mode || "standard") as string;
  const vatRate = taxMode === "small_business" ? 0 : Number(company.default_vat_rate ?? 19);
  const smallNote =
    "Steuerbefreiung für Kleinunternehmer nach § 19 Abs. 1 UStG. Es wird keine Umsatzsteuer berechnet.";
  const intro = `Materialnachweis aus Auftrag ${job.job_number || job.id}`;

  const { data: mats, error: matErr } = await s
    .from("job_materials")
    .select("material_name,quantity,unit,unit_price,inventory_material_id,created_at")
    .eq("job_id", job.id)
    .order("created_at", { ascending: true });
  if (matErr) throw new Error(matErr.message);

  const { data: plannedMats, error: plannedErr } = await s
    .from("job_planned_materials")
    .select("description,quantity,unit,quoted_unit_price")
    .eq("job_id", job.id)
    .order("created_at", { ascending: true });
  if (plannedErr) throw new Error(plannedErr.message);

  type MatRow = {
    material_name: string;
    quantity: number;
    unit: string | null;
    unit_price: number | null;
    inventory_material_id: string | null;
    created_at?: string | null;
  };
  const materialRows = (mats ?? []) as MatRow[];
  for (const pm of plannedMats ?? []) {
    const plannedName = String((pm as any).description ?? "").trim();
    if (!plannedName) continue;
    const exists = materialRows.some((m) => m.material_name === plannedName);
    if (!exists) {
      materialRows.push({
        material_name: plannedName,
        quantity: Number((pm as any).quantity ?? 0),
        unit: (pm as any).unit ?? "Stk.",
        unit_price: Number((pm as any).quoted_unit_price ?? 0),
        inventory_material_id: null,
        created_at: null as any,
      });
    }
  }

  // Normalize legacy invalid unit snapshots (for example numeric "99")
  // when generating a new/refreshed Lieferschein. Units belong to the
  // current document data, not old material snapshots.
  const validUnits = new Set(["Stk.", "m", "m²", "kg", "l", "h"]);
  for (const m of materialRows) {
    if (!m.unit || !validUnits.has(String(m.unit).trim())) {
      m.unit = "Stk.";
    }
  }

  // Prefer catalog sales_price when linked
  const invIds = materialRows.map((m) => m.inventory_material_id).filter(Boolean) as string[];
  const salesMap = new Map<string, number>();
  if (invIds.length) {
    const { data: inv } = await s
      .from("inventory_materials")
      .select("id,sales_price")
      .eq("company_id", job.company_id)
      .in("id", invIds);
    for (const row of inv ?? []) {
      salesMap.set(String(row.id), Number(row.sales_price ?? 0));
    }
  }

  // Existing draft: keep one Lieferschein per Auftrag, but refresh its material snapshot.
  // Sent/other non-draft documents are immutable snapshots and are only reopened.
  if (existing?.id) {
    if (String(existing.status ?? "") === "Entwurf") {
      const syncItems = materialRows
        .filter((m) => Number(m.quantity) > 0)
        .map((m, index) => {
          const qty = Number(m.quantity) || 0;
          const sales = m.inventory_material_id ? salesMap.get(m.inventory_material_id) : undefined;
          const price = sales && sales > 0 ? sales : Number(m.unit_price ?? 0);
          return {
            document_id: String(existing.id),
            company_id: job.company_id,
            position: index + 1,
            item_type: "material" as const,
            description: (m.material_name && String(m.material_name).trim()) || "Material",
            quantity: qty,
            unit: (m.unit && String(m.unit).trim()) || "Stk.",
            unit_price: price,
            line_total: Math.round(qty * price * 100) / 100,
          };
        });
      const del = await s.from("document_items").delete().eq("document_id", existing.id);
      if (del.error) throw new Error(del.error.message);
      if (syncItems.length) {
        const ins = await s.from("document_items").insert(syncItems);
        if (ins.error) throw new Error(ins.error.message);
      }
      await s.rpc("recalculate_document", { p_document: existing.id });
      await s.rpc("log_document_event", {
        p_document: existing.id,
        p_event_type: "updated",
        p_details: { source: "prepareDeliveryNoteFromJob", job_id: job.id, material_sync: true },
      });
      return {
        id: String(existing.id),
        document_number: String(existing.document_number ?? ""),
        already_existed: true,
        material_count: syncItems.length,
      };
    }
    return {
      id: String(existing.id),
      document_number: String(existing.document_number ?? ""),
      already_existed: true,
      material_count: materialRows.length,
    };
  }

  const { data: created, error: createErr } = await s.rpc("create_business_document", {
    p_company: job.company_id,
    p_customer: Number(job.customer_id),
    p_job: job.id,
    p_type: "delivery_note",
    p_issue_date: new Date().toISOString().slice(0, 10),
    p_due_date: null,
    p_valid_until: null,
    p_title: (job.title && String(job.title).trim()) || "Lieferschein",
    p_intro: intro,
    p_notes: (job.description && String(job.description).trim()) || null,
    p_vat_rate: vatRate,
  });
  if (createErr) {
    throw new Error(
      createErr.message.includes("Keine Berechtigung") || createErr.message.toLowerCase().includes("permission")
        ? "Keine Berechtigung — nur Büro/Inhaber können Lieferscheine erstellen."
        : createErr.message
    );
  }
  const row = (Array.isArray(created) ? created[0] : created) as { id?: string; document_number?: string } | null;
  if (!row?.id) throw new Error("Lieferschein konnte nicht erstellt werden.");

  const items: Array<{
    document_id: string;
    company_id: string;
    position: number;
    item_type: "material" | "service" | "text";
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    line_total: number;
  }> = [];

  let pos = 0;
  for (const m of materialRows) {
    const qty = Number(m.quantity) || 0;
    if (qty <= 0) continue;
    const sales = m.inventory_material_id ? salesMap.get(m.inventory_material_id) : undefined;
    const price = sales && sales > 0 ? sales : Number(m.unit_price ?? 0);
    pos += 1;
    items.push({
      document_id: row.id,
      company_id: job.company_id,
      position: pos,
      item_type: "material",
      description: (m.material_name && String(m.material_name).trim()) || "Material",
      quantity: qty,
      unit: (m.unit && String(m.unit).trim()) || "Stk.",
      unit_price: price,
      line_total: Math.round(qty * price * 100) / 100,
    });
  }

  if (items.length === 0) {
    // Fallback: one text/service line so the document is usable (packing list placeholder)
    pos = 1;
    items.push({
      document_id: row.id,
      company_id: job.company_id,
      position: 1,
      item_type: "text",
      description: `Kein Material am Auftrag gebucht — bitte Positionen ergänzen (${job.title || job.job_number || "Auftrag"})`,
      quantity: 1,
      unit: "Stk.",
      unit_price: 0,
      line_total: 0,
    });
  }

  const ins = await s.from("document_items").insert(items);
  if (ins.error) {
    await s.from("documents").delete().eq("id", row.id);
    throw new Error(ins.error.message);
  }

  await s
    .from("documents")
    .update({
      taxation_mode: taxMode === "small_business" ? "small_business" : "standard",
      tax_note: taxMode === "small_business" ? smallNote : null,
      vat_rate: vatRate,
    })
    .eq("id", row.id);

  await s.rpc("recalculate_document", { p_document: row.id });
  await s.rpc("log_document_event", {
    p_document: row.id,
    p_event_type: "created",
    p_details: { doc_type: "delivery_note", source: "prepareDeliveryNoteFromJob", job_id: job.id },
  });

  // Refresh number if RPC returned it
  let number = String(row.document_number ?? "");
  if (!number) {
    const { data: d } = await s.from("documents").select("document_number").eq("id", row.id).maybeSingle();
    number = String(d?.document_number ?? "");
  }

  return {
    id: String(row.id),
    document_number: number,
    already_existed: false,
    material_count: items.filter((i) => i.item_type === "material").length,
  };
}

export function deliveryNotePreviewHref(docId: string) {
  return `/lieferscheine?doc=${encodeURIComponent(docId)}`;
}

export function deliveryNoteCreateFromJobHref(jobId: string) {
  return `/lieferscheine?job=${encodeURIComponent(jobId)}`;
}
