/** Money still open after recorded partial payments. */
export function invoiceRemainder(total?: number | null, amountPaid?: number | null) {
  const rest = Math.round((Number(total || 0) - Number(amountPaid || 0)) * 100) / 100;
  return rest > 0 ? rest : 0;
}

/** A recorded full payment wins over a stale Überfällig label. Cancelled invoices stay cancelled. */
export function visibleInvoiceStatus(
  status: string,
  paidAt?: string | null,
  amountPaid?: number | null,
  total?: number | null
) {
  if (status === "Stornorechnung" || status === "Storniert") return status;
  if (paidAt) return "Bezahlt";
  const paid = Number(amountPaid || 0);
  const sum = total == null ? null : Number(total);
  if (paid > 0.004 && sum != null && paid + 0.004 < sum && status !== "Entwurf") return "Teilbezahlt";
  return status;
}

/** A 0 € invoice is never overdue and never belongs in Mahnungen. */
export function isInvoiceOverdue(
  doc: {
    doc_type?: string;
    status: string;
    due_date: string | null;
    paid_at?: string | null;
    total_amount?: number | null;
    amount_paid?: number | null;
  },
  todayIso: string
) {
  if (doc.doc_type && doc.doc_type !== "invoice") return false;
  if (doc.paid_at || ["Bezahlt", "Storniert", "Entwurf", "Stornorechnung"].includes(doc.status)) return false;
  if (invoiceRemainder(doc.total_amount, doc.amount_paid) <= 0) return false;
  if (doc.status === "Überfällig") return true;
  if (!doc.due_date) return false;
  return doc.due_date <= todayIso && ["Offen", "Überfällig"].includes(doc.status);
}

/** Open money excludes paid, draft, and cancelled invoices. A partial payment stays open. */
export function isOpenInvoice(status: string, paidAt?: string | null, total?: number | null, amountPaid?: number | null) {
  if (paidAt) return false;
  if (status === "Stornorechnung" || status === "Storniert" || status === "Entwurf" || status === "Bezahlt") return false;
  if (status === "Teilbezahlt") return true;
  if (amountPaid != null && total != null && Number(amountPaid) > 0.004 && invoiceRemainder(total, amountPaid) > 0) return true;
  return status === "Offen" || status === "Überfällig";
}
