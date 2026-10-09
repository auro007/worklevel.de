import assert from "node:assert/strict";
import { test } from "node:test";
import { invoiceRemainder, isInvoiceOverdue, isOpenInvoice, visibleInvoiceStatus } from "../src/lib/invoiceStatus.ts";
import { absenceEndDate, usedAbsenceDays } from "../src/lib/absenceDays.ts";

test("a paid invoice stops showing Überfällig", () => {
  assert.equal(visibleInvoiceStatus("Überfällig", "2026-09-24T10:00:00Z"), "Bezahlt");
  assert.equal(isOpenInvoice("Überfällig", "2026-09-24T10:00:00Z"), false);
  assert.equal(visibleInvoiceStatus("Storniert", "2026-09-24T10:00:00Z"), "Storniert");
  assert.equal(isOpenInvoice("Offen", null), true);
});

test("a 0 euro invoice is not overdue", () => {
  const zero = { doc_type: "invoice", status: "Überfällig", due_date: "2026-09-02", paid_at: null, total_amount: 0 };
  assert.equal(isInvoiceOverdue(zero, "2026-10-09"), false);
  assert.equal(
    isInvoiceOverdue({ doc_type: "invoice", status: "Offen", due_date: "2026-10-01", paid_at: null, total_amount: 89.25 }, "2026-10-09"),
    true
  );
});

test("a partial payment stays open and is not overdue once covered", () => {
  assert.equal(visibleInvoiceStatus("Offen", null, 40, 100), "Teilbezahlt");
  assert.equal(isOpenInvoice("Teilbezahlt", null), true);
  assert.equal(invoiceRemainder(100, 40), 60);
  assert.equal(
    isInvoiceOverdue({ doc_type: "invoice", status: "Offen", due_date: "2026-10-01", paid_at: null, total_amount: 100, amount_paid: 100 }, "2026-10-09"),
    false
  );
  assert.equal(visibleInvoiceStatus("Stornorechnung", null, 0, -100), "Stornorechnung");
});

test("vacation and sick days count only the chosen year", () => {
  const rows = [
    { type: "urlaub", startDate: "2026-08-01", days: 5 },
    { type: "urlaub", startDate: "2025-12-20", days: 4 },
    { type: "krankheit", startDate: "2026-03-02", days: 1 },
  ];
  assert.equal(usedAbsenceDays(rows, "urlaub", "2026-01-01"), 5);
  assert.equal(usedAbsenceDays(rows, "krankheit", "2026-01-01"), 1);
  assert.equal(absenceEndDate("2026-10-02", 1), "2026-10-02");
  assert.equal(absenceEndDate("2026-10-02", 0.5), "2026-10-02");
  assert.equal(absenceEndDate("2026-10-02", 3), "2026-10-04");
});
