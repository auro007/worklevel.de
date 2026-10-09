import { getSupabaseClient } from "@/lib/supabase";

export async function markInvoicePaid(documentId: string, note = "Manuell als bezahlt markiert") {
  const s = getSupabaseClient();
  if (!s) throw new Error("Supabase ist nicht verfügbar.");
  const { data } = await s.from("documents").select("total_amount").eq("id", documentId).maybeSingle();
  const total = Number(data?.total_amount || 0);
  const { error } = await s.rpc("mark_invoice_paid", { p_document: documentId, p_note: note });
  if (!error) {
    const paid = await s.from("documents").update({ amount_paid: total }).eq("id", documentId);
    if (paid.error) throw new Error(paid.error.message);
    return;
  }
  const paidAt = new Date().toISOString();
  const { error: fallback } = await s
    .from("documents")
    .update({ status: "Bezahlt", paid_at: paidAt, amount_paid: total, updated_at: paidAt })
    .eq("id", documentId);
  if (fallback) throw new Error(fallback.message);
}

/** Clears a manual payment and writes one real history entry. Returns the new status. */
export async function unmarkInvoicePaid(documentId: string) {
  const s = getSupabaseClient();
  if (!s) throw new Error("Supabase ist nicht verfügbar.");
  const { data, error } = await s
    .from("documents")
    .select("due_date,total_amount,status")
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const today = new Date().toLocaleDateString("en-CA");
  const due = (data?.due_date as string | null) ?? null;
  const amount = Number(data?.total_amount || 0);
  const next = amount > 0 && due && due <= today ? "Überfällig" : "Offen";
  const now = new Date().toISOString();
  const { error: updateError } = await s
    .from("documents")
    .update({ status: next, paid_at: null, payment_note: null, amount_paid: 0, updated_at: now })
    .eq("id", documentId);
  if (updateError) throw new Error(updateError.message);
  await s.rpc("log_document_event", {
    p_document: documentId,
    p_event_type: "status_changed",
    p_details: { status: next, payment: "zurückgenommen" },
  });
  return next;
}
