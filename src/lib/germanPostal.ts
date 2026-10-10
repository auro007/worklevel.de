export type PostalLocality = {
  name: string;
  municipalityName: string;
  municipalityType: string;
};

export type PostalCityMatch = {
  city: string;
  options: string[];
};

function unique(values: string[]) {
  return [...new Set(values)];
}

function isStadt(row: PostalLocality) {
  return /stadt/i.test(row.municipalityType) || /,\s*Stadt$/i.test(row.municipalityName);
}

/** One German PLZ can cover several villages. Prefer the Stadt, otherwise the only place. */
export function choosePostalCity(rows: PostalLocality[]): PostalCityMatch {
  const localityNames = unique(rows.map((row) => row.name.trim()).filter(Boolean));
  const options = [...localityNames].sort((a, b) => a.localeCompare(b, "de"));
  const cityNames = unique(rows.filter(isStadt).map((row) => row.name.trim()).filter(Boolean));
  if (cityNames.length === 1) return { city: cityNames[0], options };
  if (localityNames.length === 1) return { city: localityNames[0], options };
  const municipalities = unique(
    rows.map((row) => row.municipalityName.replace(/,\s*Stadt$/i, "").trim()).filter(Boolean)
  );
  if (municipalities.length === 1) return { city: municipalities[0], options: options.length ? options : municipalities };
  return { city: options[0] ?? "", options };
}

export function localitiesFromOpenPlz(data: unknown): PostalLocality[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as { name?: unknown; municipality?: { name?: unknown; type?: unknown } };
    const name = typeof item.name === "string" ? item.name : "";
    const municipalityName = typeof item.municipality?.name === "string" ? item.municipality.name : "";
    const municipalityType = typeof item.municipality?.type === "string" ? item.municipality.type : "";
    if (!name && !municipalityName) return [];
    return [{ name, municipalityName, municipalityType }];
  });
}

const cache = new Map<string, PostalCityMatch>();

export async function lookupGermanPostal(plz: string): Promise<PostalCityMatch | null> {
  const code = plz.replace(/\D/g, "");
  if (!/^\d{5}$/.test(code)) return null;
  const cached = cache.get(code);
  if (cached) return cached;
  const response = await fetch(`https://openplzapi.org/de/Localities?postalCode=${code}&pageSize=50`);
  if (!response.ok) return null;
  const chosen = choosePostalCity(localitiesFromOpenPlz(await response.json()));
  if (!chosen.city) return null;
  cache.set(code, chosen);
  return chosen;
}
