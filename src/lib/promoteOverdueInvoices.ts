import { getSupabaseClient } from "@/lib/supabase";

/** Paid invoices leave Überfällig. Open invoices past their due date become Überfällig. */
export async function promoteOverdueInvoices(companyId: string) {
  const s = getSupabaseClient();
  if (!s) return;
  const today = new Date().toLocaleDateString("en-CA");
  await s
    .from("documents")
    .update({ status: "Bezahlt" })
    .eq("company_id", companyId)
    .eq("doc_type", "invoice")
    .in("status", ["Offen", "Überfällig"])
    .not("paid_at", "is", null);
  await s
    .from("documents")
    .update({ status: "Offen" })
    .eq("company_id", companyId)
    .eq("doc_type", "invoice")
    .eq("status", "Überfällig")
    .is("paid_at", null)
    .lte("total_amount", 0);
  await s
    .from("documents")
    .update({ status: "Überfällig" })
    .eq("company_id", companyId)
    .eq("doc_type", "invoice")
    .eq("status", "Offen")
    .is("paid_at", null)
    .gt("total_amount", 0)
    .not("due_date", "is", null)
    .lte("due_date", today);
}
