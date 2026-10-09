// Vertragsangebot: the multi-page letter used for offers such as Winterdienst.
// Stored in documents.notes with the marker below. Prices stay on document_items,
// with the printed price label in `unit` and unit_price 0 (rates, not a lump sum).

export const OFFER_LETTER_MARKER = "WL-VERTRAG/1";

export type LetterParty = {
  name: string;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type OfferLetterSection = { heading: string; body: string };
export type OfferLetterRow = { label: string; value: string };

export type OfferLetter = {
  header: string;
  sections: OfferLetterSection[];
  closing: string;
  orderRows: OfferLetterRow[];
  hint: string;
};

export type LetterPrice = { description: string; price: string };

export type LetterChunk =
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "prices" }
  | { kind: "gap" }
  | { kind: "page" };

const DEFAULT_HINT =
  "Hinweis: Bei dauerhafter Verwendung als Standardvertrag empfiehlt sich eine rechtliche Prüfung der Vertragsbedingungen, insbesondere zu Haftung und objektbezogenen Pflichten.";

export function isOfferLetter(notes: string | null | undefined) {
  return Boolean(notes && notes.startsWith(OFFER_LETTER_MARKER));
}

export function defaultOrderRows(companyName: string): OfferLetterRow[] {
  const name = companyName.trim() || "Auftragnehmer";
  return [
    { label: "Auftraggeber:", value: "" },
    { label: "Anzahl Objekte:", value: "" },
    { label: "Objekt-/Flächenliste:", value: "wird vor Leistungsbeginn gemeinsam festgelegt" },
    { label: "Vertragsbeginn:", value: "" },
    { label: "Ort, Datum:", value: "" },
    { label: "Unterschrift Auftraggeber:", value: "" },
    { label: `Unterschrift ${name}:`, value: "" },
  ];
}

export function emptyOfferLetter(companyName = ""): OfferLetter {
  return {
    header: "",
    sections: [],
    closing: "Mit freundlichen Grüßen",
    orderRows: defaultOrderRows(companyName),
    hint: DEFAULT_HINT,
  };
}

export function letterChunks(body: string): LetterChunk[] {
  const out: LetterChunk[] = [];
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    out.push({ kind: "paragraph", text: para.join(" ") });
    para = [];
  };
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line === "@preise") {
      flush();
      out.push({ kind: "prices" });
      continue;
    }
    if (line === "@seite") {
      flush();
      out.push({ kind: "page" });
      continue;
    }
    const bullet = line.match(/^[-•]\s+(.*)$/);
    if (bullet) {
      flush();
      out.push({ kind: "bullet", text: bullet[1] });
      continue;
    }
    if (!line) {
      flush();
      out.push({ kind: "gap" });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

export function letterItemPrice(item: { unit?: string | null; unit_price?: number | null }) {
  const unit = (item.unit || "").trim();
  if (unit && !["stk.", "std.", "psch.", "h", "m"].includes(unit.toLowerCase())) return unit;
  const amount = Number(item.unit_price);
  if (!Number.isFinite(amount)) return "";
  return `${amount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

export function letterPriceItems(prices: LetterPrice[]) {
  return prices
    .filter((row) => row.description.trim() || row.price.trim())
    .map((row, index) => ({
      position: index + 1,
      item_type: "service" as const,
      description: row.description.trim() || "Leistung",
      quantity: 1,
      unit: row.price.trim() || "—",
      unit_price: 0,
      line_total: 0,
    }));
}

export function serializeOfferLetter(letter: OfferLetter) {
  const lines = [
    OFFER_LETTER_MARKER,
    `kopf: ${letter.header.replace(/\s+/g, " ").trim()}`,
    "---schluss---",
    letter.closing.replace(/\r\n/g, "\n").trim(),
    "---auftrag---",
    ...letter.orderRows.map(
      (row) => `${row.label.replace(/\|/g, "/").replace(/\s+/g, " ").trim()}|${row.value.replace(/\n/g, " ").trim()}`
    ),
    "---hinweis---",
    letter.hint.replace(/\r\n/g, "\n").trim(),
    "---abschnitte---",
  ];
  for (const section of letter.sections) {
    lines.push(`## ${section.heading.replace(/\s+/g, " ").trim()}`);
    lines.push(section.body.replace(/\r\n/g, "\n").trimEnd());
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function parseOfferLetter(notes: string | null | undefined): OfferLetter | null {
  if (!isOfferLetter(notes) || !notes) return null;
  const schluss = notes.indexOf("\n---schluss---\n");
  const auftrag = notes.indexOf("\n---auftrag---\n");
  const hinweis = notes.indexOf("\n---hinweis---\n");
  const abschnitte = notes.indexOf("\n---abschnitte---\n");
  if (schluss < 0 || auftrag < 0 || hinweis < 0 || abschnitte < 0) return null;
  const kopfLine = notes.slice(0, schluss).split("\n").find((line) => line.startsWith("kopf:"));
  const orderRows = notes
    .slice(auftrag + "\n---auftrag---\n".length, hinweis)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cut = line.indexOf("|");
      if (cut < 0) return { label: line, value: "" };
      return { label: line.slice(0, cut).trim(), value: line.slice(cut + 1).trim() };
    });
  const sections: OfferLetterSection[] = [];
  let current: OfferLetterSection | null = null;
  for (const line of notes.slice(abschnitte + "\n---abschnitte---\n".length).split("\n")) {
    if (line.startsWith("## ")) {
      if (current) sections.push({ heading: current.heading, body: current.body.trim() });
      current = { heading: line.slice(3).trim(), body: "" };
    } else if (current) {
      current.body += `${current.body ? "\n" : ""}${line}`;
    }
  }
  if (current) sections.push({ heading: current.heading, body: current.body.trim() });
  return {
    header: kopfLine ? kopfLine.slice(5).trim() : "",
    sections,
    closing: notes.slice(schluss + "\n---schluss---\n".length, auftrag).trim(),
    orderRows,
    hint: notes.slice(hinweis + "\n---hinweis---\n".length, abschnitte).trim(),
  };
}

export function winterdienstOffer(companyName: string) {
  const name = companyName.trim() || "Auftragnehmer";
  const letter: OfferLetter = {
    header: "Winterdienst 2026/2027",
    closing:
      "Wir freuen uns auf eine zuverlässige Zusammenarbeit und stehen für eine gemeinsame Objektbesichtigung und Flächenfestlegung gerne zur Verfügung.\n\nMit freundlichen Grüßen",
    orderRows: defaultOrderRows(name),
    hint: DEFAULT_HINT,
    sections: [
      {
        heading: "1. Leistungsumfang",
        body: [
          "- Schneeräumung der vereinbarten Geh-, Zugangs- und sonstigen ausdrücklich beauftragten Flächen.",
          "- Beseitigung bzw. Sicherung von Schnee-, Eis-, Reif- und sonstiger winterbedingter Glätte.",
          "- Streuen mit einem für die jeweilige Fläche geeigneten und örtlich zulässigen Streumittel.",
          "- Wetterbeobachtung und Organisation erforderlicher Einsätze im vereinbarten Leistungszeitraum.",
          "- Wiederholung des Winterdienstes, soweit dies durch erneuten Schneefall oder erneute Glätte erforderlich wird.",
          "- Dokumentation der durchgeführten Einsätze mit Datum, Einsatzzeit, Objekt und Art der Leistung.",
        ].join("\n"),
      },
      {
        heading: "2. Preise",
        body: [
          "@preise",
          "Alle genannten Preise verstehen sich netto zuzüglich der gesetzlichen Umsatzsteuer. Die Bereitschaftspauschale wird unabhängig von der Anzahl tatsächlich erforderlicher Einsätze berechnet. Die Einsatzabrechnung erfolgt anhand der vor Leistungsbeginn gemeinsam vereinbarten und dokumentierten Fläche.",
        ].join("\n"),
      },
      {
        heading: "3. Mehrfacheinsätze und Glätte ohne Schneefall",
        body: "Jeder erforderliche Einsatz wird separat berechnet. Dies gilt ausdrücklich auch für reine Streueinsätze bei Eis-, Reif- oder überfrierender Glätte ohne Schneefall. Tritt nach einem bereits durchgeführten Einsatz am selben Tag erneut Schneefall oder Glätte auf und wird ein weiterer Einsatz erforderlich, wird dieser erneut nach der vereinbarten Fläche mit 1,70 EUR netto/m² abgerechnet.",
      },
      {
        heading: "4. Festlegung der Flächen",
        body: "Da die genaue Quadratmeterzahl derzeit nicht bekannt ist, ist eine pauschale Gesamtfläche nicht Bestandteil dieses Angebots. Vor Vertragsbeginn werden die zu betreuenden Bereiche objektbezogen festgelegt. Die vereinbarte Objekt- und Flächenliste wird Bestandteil des Auftrags. Ändern sich Anzahl, Umfang, Zugänglichkeit oder Art der Flächen wesentlich, ist die Vergütung entsprechend anzupassen.",
      },
      {
        heading: "5. Einsatzzeiten und Durchführung",
        body: "Die Einsätze erfolgen entsprechend der tatsächlichen Wetter- und Flächenverhältnisse, der vertraglich vereinbarten Flächen sowie der jeweils geltenden örtlichen Winterdienstvorschriften. Bei andauerndem oder erneutem Schneefall bzw. erneuter Glätte können mehrere Einsätze innerhalb eines Tages erforderlich sein. Eine jederzeit vollständig schnee- und eisfreie Fläche kann während laufender Niederschläge oder plötzlich eintretender Glätte naturgemäß nicht garantiert werden; geschuldet ist die ordnungsgemäße Durchführung der vereinbarten Winterdienstleistungen im Rahmen der gesetzlichen und vertraglichen Anforderungen.\n@seite",
      },
      {
        heading: "6. Mitwirkungspflichten des Auftraggebers",
        body: "Der Auftraggeber stellt eine vollständige Objektliste mit Anschriften und den zu betreuenden Bereichen bereit, gewährt erforderliche Zugänge und teilt besondere Gefahrenstellen, bauliche Besonderheiten, empfindliche Oberflächen sowie Einschränkungen bei Streumitteln mit. Die vereinbarten Flächen sind, soweit möglich und zumutbar, von Hindernissen freizuhalten.",
      },
      {
        heading: "7. Nicht enthaltene Leistungen",
        body: "Nicht enthalten sind, sofern nicht ausdrücklich schriftlich vereinbart: Dachräumung, Entfernung von Eiszapfen, Dachlawinensicherung, Räumung öffentlicher Fahrbahnen, Abtransport außergewöhnlicher Schneemengen, nicht vereinbarte Flächen sowie der Einsatz besonderer Spezialtechnik. Zusatzleistungen können gesondert vereinbart und berechnet werden.",
      },
      {
        heading: "8. Behinderungen und außergewöhnliche Umstände",
        body: `Kann eine vereinbarte Fläche wegen verschlossener Zugänge, abgestellter Fahrzeuge, Baustellen, Gegenständen oder anderer vom Auftragnehmer nicht zu vertretender Hindernisse nicht oder nur eingeschränkt bearbeitet werden, ist ${name} insoweit von der Leistungspflicht befreit, solange das Hindernis besteht. Gesetzliche Rechte und Pflichten bleiben unberührt.`,
      },
      {
        heading: "9. Haftung",
        body: `${name} führt die vereinbarten Leistungen mit der erforderlichen fachlichen Sorgfalt aus. Die Haftung richtet sich nach den gesetzlichen Bestimmungen. Der Auftraggeber hat besondere Gefahrenstellen und objektbezogene Besonderheiten vor Leistungsbeginn mitzuteilen.`,
      },
      {
        heading: "10. Vertragszeitraum",
        body: "Vorgesehener Leistungszeitraum: 01.11.2026 bis 31.03.2027.\nEine Verlängerung oder ein Winterdiensteinsatz außerhalb dieses Zeitraums bedarf einer gesonderten Vereinbarung.",
      },
      {
        heading: "11. Abrechnung und Zahlungsbedingungen",
        body: "Die Bereitschaftspauschale wird monatlich abgerechnet. Durchgeführte Räum- und Streueinsätze werden zusätzlich nach der vereinbarten Fläche und der Anzahl der erforderlichen Einsätze berechnet. Zahlungsziel: 14 Tage ab Rechnungsdatum ohne Abzug. Bei Zahlungsverzug gelten die gesetzlichen Vorschriften.",
      },
      {
        heading: "12. Angebotsgültigkeit und Auftragserteilung",
        body: "Dieses Angebot ist 14 Tage ab Angebotsdatum gültig. Der Auftrag kommt durch schriftliche Annahme dieses Angebots bzw. durch eine gesonderte schriftliche Beauftragung zustande. Die vor Leistungsbeginn abgestimmte Objekt- und Flächenliste wird Bestandteil des Auftrags.",
      },
    ],
  };
  return {
    title: "Winterdienst - Saison 2026/2027",
    intro:
      "Sehr geehrte Damen und Herren,\n\nvielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen unser Angebot für die Durchführung des Winterdienstes an den gemeinsam festzulegenden Objekten im Raum Lingen/Emsland. Die genaue Größe der zu betreuenden Räum- und Streuflächen ist zum Zeitpunkt der Angebotserstellung noch nicht bekannt. Vor Leistungsbeginn werden die Objekte und Flächen gemeinsam festgelegt und in einer Objekt- und Flächenliste dokumentiert.",
    letter,
    prices: [
      { description: "Bereitschaftspauschale je Objekt / Monat", price: "75,00 EUR" },
      {
        description: "Räum- und Streudienst bei Schnee- und Eisglätte je m² und je erforderlichem Einsatz",
        price: "1,70 EUR / m²",
      },
    ] as LetterPrice[],
  };
}

type JsPdf = {
  addPage: () => void;
  setPage: (page: number) => void;
  getNumberOfPages: () => number;
  setFillColor: (...color: number[]) => void;
  setDrawColor: (...color: number[]) => void;
  setTextColor: (...color: number[]) => void;
  setFont: (font: string, style: string) => void;
  setFontSize: (size: number) => void;
  setLineWidth: (width: number) => void;
  setLineHeightFactor: (factor: number) => void;
  getTextWidth: (text: string) => number;
  splitTextToSize: (text: string, width: number) => string[];
  text: (text: string | string[], x: number, y: number, options?: { align?: string }) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  circle: (x: number, y: number, r: number, style?: string) => void;
  save: (filename: string) => void;
  output: (type: "arraybuffer" | "blob") => ArrayBuffer | Blob;
};

const NAVY = [23, 54, 93];
const INK = [34, 34, 34];
const MUTED = [102, 102, 102];
const BAND = [234, 240, 247];
const RULE = [214, 225, 238];

export async function buildOfferLetterPdf(input: {
  documentNumber: string;
  issueDateLabel: string;
  title: string;
  intro: string;
  letter: OfferLetter;
  prices: LetterPrice[];
  contractor: LetterParty;
  customer: LetterParty;
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" }) as unknown as JsPdf;
  const left = 20;
  const right = 190;
  const contentW = right - left;
  const bottom = 278;
  let y = 30;
  let pricesDrawn = false;

  function newPage() {
    pdf.addPage();
    y = 22;
  }
  function need(height: number) {
    if (y + height > bottom) newPage();
  }

  function drawParagraph(text: string, width = contentW, x = left) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...INK);
    const lines = pdf.splitTextToSize(text, width);
    const lh = 4.6;
    lines.forEach((line) => {
      need(lh);
      pdf.text(line, x, y);
      y += lh;
    });
    y += 1.5;
  }

  function drawBullet(text: string) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...INK);
    const lines = pdf.splitTextToSize(text, contentW - 6);
    const lh = 4.6;
    need(lh);
    pdf.setFillColor(...INK);
    pdf.circle(left + 1.3, y - 1.15, 0.55, "F");
    lines.forEach((line) => {
      need(lh);
      pdf.setTextColor(...INK);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.text(line, left + 5, y);
      y += lh;
    });
    y += 1.7;
  }

  function drawHeading(text: string) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11.5);
    pdf.setTextColor(...NAVY);
    const lines = pdf.splitTextToSize(text, contentW);
    const block = lines.length * 5.4 + 8;
    if (y + block > bottom) newPage();
    else y += 3.4;
    lines.forEach((line) => {
      pdf.text(line, left, y);
      y += 5.4;
    });
    y += 2.6;
  }

  function drawPriceTable() {
    const rows = input.prices.filter((row) => row.description.trim() || row.price.trim());
    if (!rows.length) return;
    const priceX = left + contentW * 0.66;
    const textX = left + 2.4;
    const descW = priceX - textX - 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    const measured = rows.map((row) => {
      const lines = pdf.splitTextToSize(row.description || "—", descW);
      return { ...row, lines, h: Math.max(9.2, lines.length * 4.6 + 3.4) };
    });
    const headerH = 7.4;
    const paintHeader = () => {
      pdf.setFillColor(...NAVY);
      pdf.rect(left, y, contentW, headerH, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.text("Leistung", textX, y + 4.9);
      pdf.text("Preis netto", priceX, y + 4.9);
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.2);
      pdf.line(priceX - 2, y + 1.4, priceX - 2, y + headerH - 1.4);
      y += headerH;
    };
    let segmentTop = y;
    const closeSegment = () => {
      pdf.setDrawColor(...RULE);
      pdf.setLineWidth(0.35);
      pdf.rect(left, segmentTop, contentW, y - segmentTop);
      pdf.line(priceX - 2, segmentTop, priceX - 2, y);
    };
    if (y + headerH + measured[0].h > bottom) newPage();
    segmentTop = y;
    paintHeader();
    measured.forEach((row) => {
      if (y + row.h > bottom) {
        closeSegment();
        newPage();
        segmentTop = y;
        paintHeader();
      }
      pdf.setFillColor(...BAND);
      pdf.rect(left, y, contentW, row.h, "F");
      pdf.setTextColor(...INK);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      row.lines.forEach((line, index) => {
        pdf.text(line, textX, y + 5 + index * 4.6);
      });
      pdf.setTextColor(...NAVY);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(row.price || "", priceX, y + row.h / 2 + 1.3);
      y += row.h;
    });
    closeSegment();
    y += 4.2;
  }

  function drawChunks(chunks: LetterChunk[]) {
    for (const chunk of chunks) {
      if (chunk.kind === "gap") {
        y += 2.2;
        continue;
      }
      if (chunk.kind === "page") {
        newPage();
        continue;
      }
      if (chunk.kind === "prices") {
        if (!pricesDrawn) {
          pricesDrawn = true;
          drawPriceTable();
        }
        continue;
      }
      if (chunk.kind === "bullet") drawBullet(chunk.text);
      else drawParagraph(chunk.text);
    }
  }

  function partyLines(party: LetterParty, kind: "contractor" | "customer") {
    const city = [party.postalCode, party.city].filter(Boolean).join(" ");
    if (kind === "contractor") {
      return [party.name, party.street || "", city, party.phone ? `Tel.: ${party.phone}` : "", party.email ? `E-Mail: ${party.email}` : ""]
        .map((line) => line.trim())
        .filter(Boolean);
    }
    const lines = [party.name.trim() || "[Auftraggeber]"];
    if (party.street?.trim()) lines.push(party.street.trim());
    if (city) lines.push(city);
    if (!party.street?.trim() && !city) lines.push("[Anschrift Auftraggeber]");
    return lines;
  }

  function drawParties() {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    const colW = contentW / 2;
    const wrap = (lines: string[]) => lines.flatMap((line) => pdf.splitTextToSize(line, colW - 8));
    const contractorLines = wrap(partyLines(input.contractor, "contractor"));
    const customerLines = wrap(partyLines(input.customer, "customer"));
    const metaLeft = pdf.splitTextToSize(`Angebotsnummer: ${input.documentNumber}`, colW - 8);
    const metaRight = pdf.splitTextToSize(
      input.issueDateLabel ? `Angebotsdatum: ${input.issueDateLabel}` : "Angebotsdatum: ____________________",
      colW - 8
    );
    const lh = 4.6;
    const headH = 7.2;
    const bodyH = Math.max(contractorLines.length, customerLines.length, 1) * lh + 5;
    const metaH = Math.max(metaLeft.length, metaRight.length, 1) * lh + 3.6;
    if (y + headH + bodyH + metaH > bottom) newPage();
    const top = y;
    const mid = left + colW;
    pdf.setFillColor(...BAND);
    pdf.rect(left, top, contentW, headH, "F");
    pdf.setTextColor(...INK);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text("Auftragnehmer", left + 2.4, top + 4.8);
    pdf.text("Auftraggeber", mid + 2.4, top + 4.8);
    contractorLines.forEach((line, index) => pdf.text(line, left + 2.4, top + headH + 4.4 + index * lh));
    customerLines.forEach((line, index) => pdf.text(line, mid + 2.4, top + headH + 4.4 + index * lh));
    const metaY = top + headH + bodyH + 4.4;
    metaLeft.forEach((line, index) => pdf.text(line, left + 2.4, metaY + index * lh));
    metaRight.forEach((line, index) => pdf.text(line, mid + 2.4, metaY + index * lh));
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.3);
    pdf.rect(left, top, contentW, headH + bodyH + metaH);
    pdf.line(mid, top, mid, top + headH + bodyH + metaH);
    pdf.line(left, top + headH, right, top + headH);
    pdf.line(left, top + headH + bodyH, right, top + headH + bodyH);
    y = top + headH + bodyH + metaH + 8;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...NAVY);
  pdf.text("ANGEBOT", left, y);
  y += 8;
  if (input.title.trim()) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(...INK);
    const titleLines = pdf.splitTextToSize(input.title.trim(), contentW);
    titleLines.forEach((line) => {
      pdf.text(line, left, y);
      y += 4.6;
    });
    y += 3;
  }
  drawParties();
  if (input.intro.trim()) drawChunks(letterChunks(input.intro));
  for (const section of input.letter.sections) {
    if (section.heading.trim()) drawHeading(section.heading.trim());
    if (section.body.trim()) drawChunks(letterChunks(section.body));
  }
  if (!pricesDrawn && input.prices.some((row) => row.description.trim() || row.price.trim())) {
    pricesDrawn = true;
    drawPriceTable();
  }
  if (input.letter.closing.trim()) {
    y += 4;
    const parts = input.letter.closing.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    parts.forEach((part) => {
      const signoff = part.replace(/\s+/g, " ").trim() === "Mit freundlichen Grüßen";
      if (signoff) y += 6;
      drawParagraph(part);
      if (signoff) y += 3;
    });
    const city = [input.contractor.postalCode, input.contractor.city].filter(Boolean).join(" ");
    const signature = [
      input.contractor.name,
      input.contractor.street || "",
      city,
      input.contractor.phone ? `Tel.: ${input.contractor.phone}` : "",
      input.contractor.email ? `E-Mail: ${input.contractor.email}` : "",
    ]
      .map((line) => line.trim())
      .filter(Boolean);
    signature.forEach((line) => {
      need(4.6);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...INK);
      pdf.text(line, left, y);
      y += 4.6;
    });
  }

  if (input.letter.orderRows.length || input.letter.hint.trim()) {
    pdf.addPage();
    y = 22;
    drawHeading("AUFTRAGSERTEILUNG");
    const labelW = 62;
    input.letter.orderRows.forEach((row) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      const value = row.value.trim();
      const valueLines = value ? pdf.splitTextToSize(value, contentW - labelW - 8) : [];
      const rowH = Math.max(8.2, (valueLines.length || 1) * 4.6 + 3.2);
      need(rowH);
      const top = y;
      pdf.setDrawColor(...RULE);
      pdf.setLineWidth(0.25);
      pdf.rect(left, top, contentW, rowH);
      pdf.line(left + labelW, top, left + labelW, top + rowH);
      pdf.setTextColor(...INK);
      const label = row.label.trim().endsWith(":") ? row.label.trim() : `${row.label.trim()}:`;
      pdf.text(label, left + 2.2, top + 5.3);
      if (valueLines.length) {
        valueLines.forEach((line, index) => pdf.text(line, left + labelW + 3, top + 5.3 + index * 4.6));
      } else {
        pdf.setDrawColor(80, 80, 80);
        pdf.setLineWidth(0.25);
        pdf.line(left + labelW + 3, top + 5.6, right - 6, top + 5.6);
      }
      y += rowH;
    });
    if (input.letter.hint.trim()) {
      y += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(...MUTED);
      pdf.splitTextToSize(input.letter.hint.trim(), contentW).forEach((line) => {
        need(3.8);
        pdf.text(line, left, y);
        y += 3.8;
      });
    }
  }

  const footerBits = [
    input.contractor.name,
    input.contractor.street || "",
    [input.contractor.postalCode, input.contractor.city].filter(Boolean).join(" "),
    input.contractor.phone || "",
    input.contractor.email || "",
  ]
    .map((bit) => bit.trim())
    .filter(Boolean);
  const footer = footerBits.join(" | ");
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFillColor(...NAVY);
    pdf.rect(0, 0, 210, 12, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    let nameSize = 11;
    const brand = (input.contractor.name || "Firma").toUpperCase();
    pdf.setFontSize(nameSize);
    while (nameSize > 8 && pdf.getTextWidth(brand) > 105) {
      nameSize -= 0.5;
      pdf.setFontSize(nameSize);
    }
    pdf.text(brand, 18, 8);
    const subject = input.letter.header.trim();
    if (subject) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      const fitted = pdf.splitTextToSize(subject, 78);
      pdf.text(fitted[0], 192, 8, { align: "right" });
    }
    pdf.setDrawColor(...RULE);
    pdf.setLineWidth(0.35);
    pdf.line(18, 283.5, 192, 283.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...MUTED);
    if (footer) pdf.text(pdf.splitTextToSize(footer, 150)[0], 18, 288);
    pdf.text(`Seite ${page}`, 192, 288, { align: "right" });
  }
  return pdf;
}
