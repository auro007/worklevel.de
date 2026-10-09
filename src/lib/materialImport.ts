export function parseDelimited(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const first = text.split("\n")[0] || "";
  const delimiter = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === delimiter || c === "\n")) {
      row.push(cell.trim()); cell = "";
      if (c === "\n") { if (row.some(Boolean)) rows.push(row); row = []; }
    } else cell += c;
  }
  if (quoted) throw new Error("Nicht geschlossene Anführungszeichen in der CSV-Datei.");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function importNumber(raw: string, decimal: "," | "."): number {
  const cleaned = raw.trim().replace(/EUR|€/gi, "").replace(/\s/g, "");
  if (!cleaned) return 0;
  const pattern = decimal === "," ? /^\d+(?:\.\d{3})*(?:,\d+)?$/ : /^\d+(?:,\d{3})*(?:\.\d+)?$/;
  if (!pattern.test(cleaned)) throw new Error(`Ungültige Zahl: ${raw}`);
  const result = Number(decimal === "," ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, ""));
  if (!Number.isFinite(result)) throw new Error(`Ungültige Zahl: ${raw}`);
  return result;
}

export async function readMaterialFile(file: File): Promise<string[][]> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Bitte eine Datei unter 20 MB auswählen.");
  if (!file.name.toLowerCase().endsWith(".pdf")) return parseDelimited(await file.text());
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const rows: string[][] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      const lines: { y: number; cells: { x: number; text: string }[] }[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5], x = item.transform[4];
        let line = lines.find(l => Math.abs(l.y - y) < 3);
        if (!line) { line = { y, cells: [] }; lines.push(line); }
        line.cells.push({ x, text: item.str.trim() });
      }
      lines.sort((a, b) => b.y - a.y).forEach(l => rows.push(l.cells.sort((a, b) => a.x - b.x).map(c => c.text)));
    }
  } finally { await doc.destroy(); }
  if (!rows.length) throw new Error("Dieses PDF enthält keinen lesbaren Text. Bitte eine CSV-Datei oder ein PDF mit auswählbarem Text verwenden.");
  return rows;
}
