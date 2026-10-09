import assert from "node:assert/strict";
import { test } from "node:test";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { buildZugferdInvoice } from "../src/lib/zugferdInvoice.ts";
import { embedZugferdXml } from "../src/lib/zugferdPdf.ts";

function inflatedStreams(bytes) {
  const raw = Buffer.from(bytes);
  const latin = raw.toString("latin1");
  const parts = [];
  let cursor = 0;
  while (cursor < latin.length) {
    const start = latin.indexOf("stream\n", cursor);
    if (start < 0) break;
    const dataStart = start + "stream\n".length;
    const end = latin.indexOf("\nendstream", dataStart);
    if (end < 0) break;
    parts.push(zlib.inflateSync(raw.subarray(dataStart, end)).toString("utf8"));
    cursor = end + 10;
  }
  return parts.join("\n");
}

const seller = {
  name: "WorkLevel GmbH",
  street: "Heizstraße 1",
  postalCode: "10115",
  city: "Berlin",
  vatId: "DE123456789",
  iban: "DE89 3704 0044 0532 0130 00",
  bic: "COBADEFFXXX",
};
const buyer = { name: "Müller Bau GmbH", street: "Hauptstraße 6", postalCode: "80331", city: "München" };

test("a standard invoice becomes EN 16931 XML with SEPA payment", () => {
  const result = buildZugferdInvoice({
    number: "RE-2026-0001",
    issueDate: "2026-10-02",
    dueDate: "2026-10-16",
    smallBusiness: false,
    vatRate: 19,
    seller,
    buyer,
    lines: [{ description: "Wartung", quantity: 2, unit: "Std.", unitPrice: 75 }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.xml, /urn:factur-x.eu:1p0:en16931/);
  assert.match(result.xml, /<ram:ID>RE-2026-0001<\/ram:ID>/);
  assert.match(result.xml, /unitCode="HUR"/);
  assert.match(result.xml, /<ram:LineTotalAmount>150.00<\/ram:LineTotalAmount>/);
  assert.match(result.xml, /<ram:TaxTotalAmount currencyID="EUR">28.50<\/ram:TaxTotalAmount>/);
  assert.match(result.xml, /<ram:GrandTotalAmount>178.50<\/ram:GrandTotalAmount>/);
  assert.match(result.xml, /<ram:TypeCode>58<\/ram:TypeCode>/);
  assert.match(result.xml, /<ram:IBANID>DE89370400440532013000<\/ram:IBANID>/);
  assert.doesNotMatch(result.xml, /<ram:CategoryCode>O<\/ram:CategoryCode>/);
});

test("Kleinunternehmer invoices carry no VAT and name § 19", () => {
  const result = buildZugferdInvoice({
    number: "RE-2026-0002",
    issueDate: "2026-10-02",
    smallBusiness: true,
    vatRate: 19,
    seller: { ...seller, vatId: "", taxNumber: "12/345/67890" },
    buyer,
    lines: [{ description: "Montage", quantity: 1, unit: "Stk.", unitPrice: 100 }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.xml, /<ram:CategoryCode>O<\/ram:CategoryCode>/);
  assert.match(result.xml, /§ 19 UStG/);
  assert.match(result.xml, /schemeID="FC"/);
  assert.match(result.xml, /<ram:TaxTotalAmount currencyID="EUR">0.00<\/ram:TaxTotalAmount>/);
  assert.doesNotMatch(result.xml, /RateApplicablePercent/);
});

test("missing address blocks the e-invoice", () => {
  const result = buildZugferdInvoice({
    number: "RE-2026-0003",
    issueDate: "2026-10-02",
    smallBusiness: false,
    vatRate: 19,
    seller,
    buyer: { name: "Ohne Ort" },
    lines: [{ description: "Wartung", quantity: 1, unit: "Std.", unitPrice: 10 }],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.problems.join(" "), /Kunde: PLZ und Ort fehlen/);
});

test("the XML is embedded in the PDF under factur-x.xml", async () => {
  const result = buildZugferdInvoice({
    number: "RE-2026-0004",
    issueDate: "2026-10-02",
    dueDate: "2026-10-16",
    smallBusiness: false,
    vatRate: 19,
    seller,
    buyer,
    lines: [{ description: "Wartung", quantity: 1, unit: "Std.", unitPrice: 10 }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const plain = await PDFDocument.create();
  plain.addPage();
  const hybrid = await embedZugferdXml(await plain.save(), result.xml);
  const unpacked = inflatedStreams(hybrid);
  assert.match(unpacked, /factur-x\.xml/);
  assert.match(unpacked, /urn:factur-x.eu:1p0:en16931/);
  assert.match(unpacked, /RE-2026-0004/);
  assert.match(unpacked, /\/AFRelationship \/Data/);
  assert.match(unpacked, /<fx:ConformanceLevel>EN 16931<\/fx:ConformanceLevel>/);
});

test("printed totals are kept when they add up", () => {
  const result = buildZugferdInvoice({
    number: "RE-2026-0005",
    issueDate: "2026-10-02",
    dueDate: "2026-10-16",
    smallBusiness: false,
    vatRate: 19,
    subtotal: 150,
    vatAmount: 28.5,
    totalAmount: 178.5,
    seller,
    buyer,
    lines: [{ description: "Wartung", quantity: 2, unit: "Std.", unitPrice: 75, lineTotal: 150 }],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.xml, /<ram:GrandTotalAmount>178.50<\/ram:GrandTotalAmount>/);
});

test("a total that does not match net plus VAT blocks the e-invoice", () => {
  const result = buildZugferdInvoice({
    number: "RE-2026-0006",
    issueDate: "2026-10-02",
    smallBusiness: false,
    vatRate: 19,
    subtotal: 150,
    vatAmount: 28.5,
    totalAmount: 200,
    seller,
    buyer,
    lines: [{ description: "Wartung", quantity: 2, unit: "Std.", unitPrice: 75, lineTotal: 150 }],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.problems.join(" "), /Gesamtbetrag/);
});
