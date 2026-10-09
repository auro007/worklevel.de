import { getSupabaseClient } from "@/lib/supabase";

export type InvoiceFromJobResult = {
  id: string;
  document_number: string;
  already_existed: boolean;
};

/** Owner/admin: create draft invoice from job materials + time, or open existing. */
export async function prepareInvoiceFromJob(jobId: string): Promise<InvoiceFromJobResult> {
  const s = getSupabaseClient();
  if (!s) throw new Error("Supabase ist nicht verfügbar.");
  const { data, error } = await s.rpc("create_invoice_from_job", { p_job: jobId });
  if (error) {
    throw new Error(
      error.message.includes("Keine Berechtigung")
        ? "Keine Berechtigung — nur Büro/Inhaber können Rechnungen vorbereiten."
        : error.message + (error.message.includes("function") ? " — Bitte SETUP-WORKLEVEL-V14.4-INVOICE-FROM-JOB.sql ausführen." : "")
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as InvoiceFromJobResult | null;
  if (!row?.id) throw new Error("Rechnung konnte nicht erstellt werden.");
  return {
    id: String(row.id),
    document_number: String(row.document_number ?? ""),
    already_existed: Boolean(row.already_existed),
  };
}

export function invoicePreviewHref(docId: string) {
  return `/rechnungen?doc=${encodeURIComponent(docId)}`;
}
