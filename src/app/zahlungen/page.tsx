"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, PageHeader, StatCard } from "@/components/UI";
import { useAppData } from "@/context/AppDataProvider";
import { useCompany } from "@/context/CompanyProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { invoiceRemainder, isOpenInvoice, visibleInvoiceStatus } from "@/lib/invoiceStatus";
import { useConfirm } from "@/components/ConfirmProvider";
import { markInvoicePaid, unmarkInvoicePaid } from "@/lib/markInvoicePaid";
import { promoteOverdueInvoices } from "@/lib/promoteOverdueInvoices";
import { euro, formatCloudError, formatDate } from "@/lib/utils";

type PaymentRow = {
  id: string;
  customer_id: number | string;
  document_number: string;
  status: string;
  due_date: string | null;
  total_amount: number;
  amount_paid?: number | null;
  paid_at: string | null;
};

export default function PaymentsPage() {
  const ask = useConfirm();
  const { customers } = useAppData();
  const { company, role } = useCompany();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const s = getSupabaseClient();
    if (!s || !company) return;
    setLoading(true);
    setError("");
    await promoteOverdueInvoices(company.id);
    const { data, error: loadError } = await s
      .from("documents")
      .select("id,customer_id,document_number,status,due_date,total_amount,amount_paid,paid_at")
      .eq("company_id", company.id)
      .eq("doc_type", "invoice")
      .order("due_date", { ascending: true });
    if (loadError) {
      setError(formatCloudError(loadError.message));
      setRows([]);
    } else {
      setRows((data ?? []) as PaymentRow[]);
    }
    setLoading(false);
  }, [company?.id]);

  useEffect(() => {
    if (role === "worker") return;
    void load();
  }, [load, role]);

  const openRows = useMemo(
    () => rows.filter((row) => isOpenInvoice(visibleInvoiceStatus(row.status, row.paid_at, row.amount_paid, row.total_amount), row.paid_at, row.total_amount, row.amount_paid)),
    [rows]
  );
  const paidRows = useMemo(
    () => rows.filter((row) => visibleInvoiceStatus(row.status, row.paid_at, row.amount_paid, row.total_amount) === "Bezahlt"),
    [rows]
  );
  const openSum = openRows.reduce((sum, row) => sum + invoiceRemainder(row.total_amount, row.amount_paid), 0);

  async function undo(id: string, number: string) {
    if (!confirm(`${number}: Zahlung zurücknehmen? Die Rechnung wird wieder offen.`)) return;
    setBusyId(id);
    setError("");
    try {
      await unmarkInvoicePaid(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zahlung konnte nicht zurückgenommen werden.");
    }
    setBusyId(null);
  }

  async function pay(id: string, number: string) {
    const ok = await ask(`${number} als bezahlt markieren?`, "Als bezahlt");
    if (!ok) return;
    setBusyId(id);
    setError("");
    try {
      await markInvoicePaid(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zahlung konnte nicht gespeichert werden.");
    }
    setBusyId(null);
  }

  if (role === "worker") {
    return (
      <main className="page">
        <PageHeader title="Zahlungen" subtitle="Nur für Büro / Inhaber" />
        <EmptyState title="Kein Zugriff" hint="Mitarbeiter sehen diese Seite nicht." />
      </main>
    );
  }

  return (
    <main className="page">
      <PageHeader
        title="Zahlungen"
        subtitle="Offene Rechnungen als bezahlt markieren"
        action={
          <Link className="ghostBtn" href="/rechnungen">
            Alle Rechnungen →
          </Link>
        }
      />
      {error && <div className="loginError pageError">{error}</div>}
      <section className="statsGrid">
        <StatCard label="Offen" value={loading ? "…" : String(openRows.length)} hint="Noch nicht bezahlt" />
        <StatCard label="Offener Betrag" value={loading ? "…" : euro(openSum)} hint="Brutto" />
        <StatCard label="Bezahlt" value={loading ? "…" : String(paidRows.length)} hint="Mit Zahlungsdatum" />
      </section>
      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Rechnung</th>
              <th>Kunde</th>
              <th>Fällig</th>
              <th>Betrag</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <LoadingState label="Zahlungen werden geladen…" />
                </td>
              </tr>
            ) : openRows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState title="Keine offenen Rechnungen" hint="Bezahlte Rechnungen stehen unten." />
                </td>
              </tr>
            ) : (
              openRows.map((row) => {
                const customer = customers.find((item) => Number(item.id) === Number(row.customer_id));
                const status = visibleInvoiceStatus(row.status, row.paid_at, row.amount_paid, row.total_amount);
                return (
                  <tr key={row.id} className={status === "Überfällig" ? "rowOverdue" : undefined}>
                    <td className="orangeText">{row.document_number}</td>
                    <td>{customer?.name ?? "—"}</td>
                    <td className={status === "Überfällig" ? "dueOverdue" : undefined}>{row.due_date ? formatDate(row.due_date) : "—"}</td>
                    <td className="money">{euro(invoiceRemainder(row.total_amount, row.amount_paid))}</td>
                    <td>{status}</td>
                    <td>
                      <button className="primaryBtn smallBtn" type="button" disabled={busyId === row.id} onClick={() => void pay(row.id, row.document_number)}>
                        {busyId === row.id ? "Speichert…" : "Als bezahlt"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {paidRows.length > 0 && (
        <div className="tableWrap" style={{ marginTop: 18 }}>
          <table className="dataTable">
            <thead>
              <tr>
                <th>Bezahlt</th>
                <th>Kunde</th>
                <th>Zahlungsdatum</th>
                <th>Betrag</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paidRows.map((row) => {
                const customer = customers.find((item) => Number(item.id) === Number(row.customer_id));
                return (
                  <tr key={row.id}>
                    <td className="orangeText">{row.document_number}</td>
                    <td>{customer?.name ?? "—"}</td>
                    <td>{row.paid_at ? new Date(row.paid_at).toLocaleString("de-DE") : "—"}</td>
                    <td className="money">{euro(Number(row.total_amount))}</td>
                    <td>
                      <button className="ghostBtn smallBtn" type="button" disabled={busyId === row.id} onClick={() => void undo(row.id, row.document_number)}>
                        {busyId === row.id ? "Speichert…" : "Zahlung zurücknehmen"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
