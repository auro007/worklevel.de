export type ZugferdParty = {
  name?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  vatId?: string | null;
  taxNumber?: string | null;
  iban?: string | null;
  bic?: string | null;
};

export type ZugferdLine = {
  description?: string | null;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  /** Printed line total. Used when it matches Menge × Preis. */
  lineTotal?: number | null;
};

export type ZugferdInvoiceInput = {
  number: string;
  issueDate: string;
  dueDate?: string | null;
  smallBusiness: boolean;
  vatRate: number;
  /** Printed header amounts. The XML uses these when they add up. */
  subtotal?: number | null;
  vatAmount?: number | null;
  totalAmount?: number | null;
  seller: ZugferdParty;
  buyer: ZugferdParty;
  lines: ZugferdLine[];
};

export type ZugferdResult =
  | { ok: true; xml: string }
  | { ok: false; problems: string[] };

const GUIDELINE = "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931";

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dec(value: number) {
  return money(value).toFixed(2);
}

function quantityText(value: number) {
  const rounded = Math.round((value + Number.EPSILON) * 10000) / 10000;
  return rounded.toFixed(4).replace(/\.?0+$/, "") || "0";
}

function priceText(value: number) {
  const precise = Math.round((value + Number.EPSILON) * 10000) / 10000;
  if (Math.abs(precise - money(value)) < 0.0000001) return dec(value);
  return precise.toFixed(4).replace(/0+$/, "");
}

function near(left: number, right: number) {
  return Math.abs(money(left) - money(right)) <= 0.01;
}

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compact(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function date102(value: string | null | undefined) {
  const day = compact(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.replace(/-/g, "") : "";
}

function unitCode(unit: string) {
  const value = unit.trim().toLowerCase().replace(/\./g, "");
  if (["std", "stunde", "stunden", "h", "hour", "hours"].includes(value)) return "HUR";
  if (["m", "meter", "lfm"].includes(value)) return "MTR";
  if (["m2", "m²", "qm"].includes(value)) return "MTK";
  if (["m3", "m³", "cbm"].includes(value)) return "MTQ";
  if (["kg", "kilo"].includes(value)) return "KGM";
  if (["l", "liter", "ltr"].includes(value)) return "LTR";
  if (["tag", "tage", "day"].includes(value)) return "DAY";
  if (["stk", "stück", "stueck", "stuck", "pcs"].includes(value)) return "H87";
  return "C62";
}

function partyProblems(label: string, party: ZugferdParty, requireTax: boolean) {
  const problems: string[] = [];
  if (!compact(party.name)) problems.push(`${label}: Name fehlt.`);
  if (!compact(party.postalCode) || !compact(party.city)) problems.push(`${label}: PLZ und Ort fehlen.`);
  if (requireTax && !compact(party.vatId) && !compact(party.taxNumber)) {
    problems.push(`${label}: USt-IdNr. oder Steuernummer fehlt.`);
  }
  return problems;
}

export function buildZugferdInvoice(input: ZugferdInvoiceInput): ZugferdResult {
  const problems = [
    ...partyProblems("Firma", input.seller, true),
    ...partyProblems("Kunde", input.buyer, false),
  ];
  const issue = date102(input.issueDate);
  if (!compact(input.number)) problems.push("Rechnungsnummer fehlt.");
  if (!issue) problems.push("Rechnungsdatum fehlt.");
  const lines = input.lines.filter((line) => compact(line.description) || Number(line.quantity) || Number(line.unitPrice));
  if (lines.length === 0) problems.push("Mindestens eine Rechnungsposition fehlt.");
  if (lines.some((line) => !Number.isFinite(line.quantity) || !Number.isFinite(line.unitPrice) || (line.lineTotal != null && !Number.isFinite(line.lineTotal)))) {
    problems.push("Menge oder Preis einer Position ist ungültig.");
  }
  if (problems.length) return { ok: false, problems };

  const rate = input.smallBusiness ? 0 : Number(input.vatRate) || 0;
  const category = input.smallBusiness ? "O" : rate === 0 ? "Z" : "S";
  const prepared = lines.map((line, index) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const calculated = money(quantity * unitPrice);
    const printed = line.lineTotal == null ? calculated : money(Number(line.lineTotal));
    return {
      id: String(index + 1),
      name: compact(line.description) || "Position",
      quantity,
      unit: unitCode(line.unit || "Stk."),
      unitPrice,
      lineTotal: printed,
      matches: near(printed, calculated),
    };
  });
  if (prepared.some((line) => !line.matches)) {
    problems.push("Eine Positionssumme passt nicht zu Menge und Preis.");
  }
  const calculatedBasis = money(prepared.reduce((sum, line) => sum + line.lineTotal, 0));
  const basis = input.subtotal == null ? calculatedBasis : money(Number(input.subtotal));
  if (input.subtotal != null && !near(basis, calculatedBasis)) {
    problems.push("Die Nettosumme passt nicht zu den Positionen.");
  }
  const calculatedTax = input.smallBusiness ? 0 : money(basis * rate / 100);
  const tax = input.vatAmount == null || input.smallBusiness ? calculatedTax : money(Number(input.vatAmount));
  if (!near(tax, calculatedTax)) problems.push("Die MwSt. passt nicht zu Netto und Steuersatz.");
  const calculatedGross = money(basis + tax);
  const gross = input.totalAmount == null ? calculatedGross : money(Number(input.totalAmount));
  if (!near(gross, calculatedGross)) problems.push("Der Gesamtbetrag passt nicht zu Netto plus MwSt.");
  if (problems.length) return { ok: false, problems };
  const due = date102(input.dueDate) || issue;
  const iban = compact(input.seller.iban).replace(/\s+/g, "").toUpperCase();
  const bic = compact(input.seller.bic).replace(/\s+/g, "").toUpperCase();
  const vatId = compact(input.seller.vatId).replace(/\s+/g, "").toUpperCase();
  const taxNumber = compact(input.seller.taxNumber);

  const taxRegs = [
    vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xml(vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
    taxNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${xml(taxNumber)}</ram:ID></ram:SpecifiedTaxRegistration>` : "",
  ].join("");

  const address = (party: ZugferdParty) => `<ram:PostalTradeAddress>
        ${compact(party.street) ? `<ram:LineOne>${xml(compact(party.street))}</ram:LineOne>` : ""}
        <ram:PostcodeCode>${xml(compact(party.postalCode))}</ram:PostcodeCode>
        <ram:CityName>${xml(compact(party.city))}</ram:CityName>
        <ram:CountryID>DE</ram:CountryID>
      </ram:PostalTradeAddress>`;

  const rateXml = category === "O" ? "" : `<ram:RateApplicablePercent>${dec(rate)}</ram:RateApplicablePercent>`;
  const exemption = category === "O"
    ? "<ram:ExemptionReason>Kein Steuerausweis, Kleinunternehmer gemäß § 19 UStG.</ram:ExemptionReason>"
    : "";

  const lineXml = prepared.map((line) => `<ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${line.id}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${xml(line.name)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${priceText(line.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${line.unit}">${quantityText(line.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${category}</ram:CategoryCode>
          ${rateXml}
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${dec(line.lineTotal)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join("");

  const payment = iban
    ? `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${xml(iban)}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>
        ${bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${xml(bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}
      </ram:SpecifiedTradeSettlementPaymentMeans>`
    : `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>1</ram:TypeCode></ram:SpecifiedTradeSettlementPaymentMeans>`;

  const xmlDoc = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${GUIDELINE}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${xml(compact(input.number))}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${issue}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${lineXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${xml(compact(input.seller.name))}</ram:Name>
        ${address(input.seller)}
        ${taxRegs}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${xml(compact(input.buyer.name))}</ram:Name>
        ${address(input.buyer)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime><udt:DateTimeString format="102">${issue}</udt:DateTimeString></ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${payment}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${dec(tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${exemption}
        <ram:BasisAmount>${dec(basis)}</ram:BasisAmount>
        <ram:CategoryCode>${category}</ram:CategoryCode>
        ${rateXml}
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>Zahlbar bis ${due.slice(6, 8)}.${due.slice(4, 6)}.${due.slice(0, 4)} ohne Abzug.</ram:Description>
        <ram:DueDateDateTime><udt:DateTimeString format="102">${due}</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${dec(basis)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${dec(basis)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${dec(tax)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${dec(gross)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${dec(gross)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
  return { ok: true, xml: xmlDoc };
}
