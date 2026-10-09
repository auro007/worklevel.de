export const errorCodeFields = { code: "Code", title: "Titel", description: "Beschreibung" } as const;
export type ErrorCodeField = keyof typeof errorCodeFields;

const aliases: Record<ErrorCodeField, RegExp> = {
  code: /^(code|fehlercode|fehler-?code|störungscode|stoerungscode|nr\.?|nummer|fehlernr\.?|fehler-?nr\.?)$/i,
  title: /^(titel|title|bezeichnung|störung|stoerung|bedeutung|meaning|name|kurztext)$/i,
  description: /^(beschreibung|description|ursache|hinweis|maßnahme|massnahme|lösung|loesung|text|abhilfe)$/i,
};

export function looksLikeErrorCode(value: string) {
  const text = value.trim();
  return text.length > 0 && text.length <= 16 && /^(?=.*\d)[A-Za-z0-9./-]{1,16}$/.test(text);
}

export function guessErrorCodeColumns(header: string[]): Record<ErrorCodeField, number> {
  const map: Record<ErrorCodeField, number> = { code: -1, title: -1, description: -1 };
  header.forEach((cell, index) => {
    const value = cell.trim();
    (Object.keys(aliases) as ErrorCodeField[]).forEach((key) => {
      if (map[key] < 0 && aliases[key].test(value)) map[key] = index;
    });
  });
  return map;
}

/** Header names win. Otherwise the first column that mostly looks like codes is used. */
export function guessErrorCodeColumnsFromRows(rows: string[][]): { mapping: Record<ErrorCodeField, number>; header: boolean } {
  const fromHeader = guessErrorCodeColumns(rows[0] || []);
  if (fromHeader.code >= 0) return { mapping: fromHeader, header: true };
  const sample = rows.slice(0, 12);
  const width = Math.max(0, ...sample.map((row) => row.length));
  let code = -1;
  for (let column = 0; column < width; column++) {
    const filled = sample.map((row) => (row[column] || "").trim()).filter(Boolean);
    if (filled.length >= 2 && filled.filter(looksLikeErrorCode).length / filled.length >= 0.6) {
      code = column;
      break;
    }
  }
  return {
    mapping: { code, title: code >= 0 && code + 1 < width ? code + 1 : -1, description: code >= 0 && code + 2 < width ? code + 2 : -1 },
    header: false,
  };
}
