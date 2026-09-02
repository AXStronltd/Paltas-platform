/**
 * Third-party listing payloads, normalised.
 *
 * Deliberately provider-agnostic and pure. Aggregators disagree about almost
 * everything — `price` may be a number, a string with a currency symbol, or a
 * range; area may be square metres or square feet; images may be strings or
 * objects. Keeping the mess in one tested function means swapping Apify for a
 * licensed feed is a mapping change here and nothing else.
 *
 * The rule throughout: when a field cannot be read confidently, it is left
 * null. A wrong price on a property listing is worse than a missing one — a
 * visitor who sees "no price" asks, and a visitor who sees the wrong price
 * believes it.
 */

export interface RawExternal {
  [key: string]: unknown;
}

export interface NormalisedListing {
  externalId: string;
  sourceUrl: string | null;
  sourceSite: string | null;
  title: string;
  description: string | null;
  kind: "SALE" | "RENT" | "STAY";
  price: number | null;
  currency: string | null;
  priceRaw: string | null;
  country: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqm: number | null;
  amenities: string[];
  images: string[];
  agentName: string | null;
  agentPhone: string | null;
  agentEmail: string | null;
  agencyName: string | null;
}

/** Reads a value from any of several likely key spellings. */
function pick(raw: RawExternal, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = raw[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

/**
 * A number, from whatever separator convention the source used.
 *
 * Not rounded and not guarded — this is the arithmetic only. `parsePrice` adds
 * the guards that suit money, and `parseArea` keeps the decimals that suit
 * floor area. They were one function until "95 m²" was read as a price with a
 * million suffix and thrown away.
 */
export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;

  const digits = v.replace(/[^\d.,]/g, "");
  if (!/\d/.test(digits)) return null;

  const dots = (digits.match(/\./g) ?? []).length;
  const commas = (digits.match(/,/g) ?? []).length;

  let cleaned: string;
  if (dots > 0 && commas > 0) {
    // Both present: whichever comes last is the decimal point.
    cleaned = digits.lastIndexOf(",") > digits.lastIndexOf(".")
      ? digits.replace(/\./g, "").replace(",", ".")
      : digits.replace(/,/g, "");
  } else if (dots > 1 || commas > 1) {
    // Repeated separators can only be thousands grouping — "1.234.567".
    cleaned = digits.replace(/[.,]/g, "");
  } else if (dots === 1 || commas === 1) {
    // The ambiguous case: "450.000" is four hundred and fifty thousand across
    // most of Europe, "450.00" is four hundred and fifty everywhere. Exactly
    // three trailing digits means grouping — no currency here is quoted to
    // three decimal places, and no floor area is measured that finely.
    cleaned = /[.,]\d{3}$/.test(digits)
      ? digits.replace(/[.,]/g, "")
      : digits.replace(",", ".");
  } else {
    cleaned = digits;
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * A price, as a whole number in the listing's own currency.
 *
 * Refuses more than it accepts. A wrong price on a property listing is worse
 * than a missing one: a visitor who sees no price asks, and a visitor who sees
 * the wrong price believes it.
 */
export function parsePrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const text = v.trim();

  // A range, or an open-ended "from". Publishing the lower bound would state a
  // real price that nobody actually offered.
  if (/\d\s*(-|–|—|to)\s*\d/i.test(text)) return null;
  if (/\b(from|desde|ab|starting)\b/i.test(text)) return null;

  // "300k" and "1.2M" lose three or six orders of magnitude if the suffix is
  // ignored. Anchored to a word boundary *after* the suffix so "95 m²" is not
  // mistaken for 95 million.
  if (/\d\s*(k|m|mn|bn|million|mill)(?![a-z²³])\b/i.test(text)) return null;

  const n = parseNumber(text);
  return n !== null && n >= 0 ? Math.round(n) : null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR", "£": "GBP", "$": "USD", "₹": "INR", "R$": "BRL", "฿": "THB", "₺": "TRY",
};

export function parseCurrency(v: unknown, priceText?: unknown): string | null {
  const explicit = str(v);
  if (explicit && /^[A-Za-z]{3}$/.test(explicit)) return explicit.toUpperCase();

  const text = str(priceText) ?? explicit;
  if (!text) return null;
  const code = text.match(/\b([A-Z]{3})\b/);
  if (code) return code[1];
  for (const [symbol, iso] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) return iso;
  }
  return null;
}

/** Square feet are converted; anything unrecognised is left null. */
export function parseArea(raw: RawExternal): number | null {
  const direct = pick(raw, "areaSqm", "area_sqm", "livingAreaSqm", "surface", "area", "size", "floorArea");
  const unit = str(pick(raw, "areaUnit", "area_unit", "sizeUnit"))?.toLowerCase() ?? "";
  const text = typeof direct === "string" ? direct.toLowerCase() : "";

  const n = parseNumber(direct);
  if (n === null || n <= 0) return null;

  const isFeet = unit.includes("ft") || unit.includes("feet") || /sq\s?\.?\s?ft|ft²|sqft/.test(text);
  return isFeet ? Math.round(n * 0.092903 * 100) / 100 : n;
}

function parseInt_(v: unknown): number | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : Math.max(0, Math.round(v));
  const n = parsePrice(v);
  return n === null ? null : n;
}

/**
 * The kind of transaction. Inferred from whatever the source calls it, and
 * defaulted to SALE only when there is no signal either way.
 */
export function parseKind(raw: RawExternal): "SALE" | "RENT" | "STAY" {
  const text = [
    str(pick(raw, "operation", "operationType", "transactionType", "listingType", "dealType", "type")),
    str(pick(raw, "title")),
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\b(rent|rental|let|lettings|alquiler|miete|location)\b/.test(text)) return "RENT";
  if (/\b(short.?term|holiday|vacation|nightly|per night)\b/.test(text)) return "STAY";
  return "SALE";
}

/** Images arrive as strings, as {url}, or as {src}. All three are accepted. */
export function parseImages(raw: RawExternal): string[] {
  const v = pick(raw, "images", "photos", "pictures", "imageUrls", "media");
  if (!Array.isArray(v)) {
    const one = str(v);
    return one && /^https?:\/\//.test(one) ? [one] : [];
  }
  const out: string[] = [];
  for (const item of v) {
    const url = typeof item === "string"
      ? item
      : str((item as RawExternal)?.url ?? (item as RawExternal)?.src ?? (item as RawExternal)?.href);
    // Only absolute http(s). A relative path from someone else's site resolves
    // against ours and 404s.
    if (url && /^https?:\/\//.test(url)) out.push(url);
  }
  return [...new Set(out)].slice(0, 30);
}

/**
 * Normalise one record.
 *
 * Returns null when there is no usable identity or title — a listing we cannot
 * name and cannot match to its source on the next sync is not worth storing.
 */
export function normalise(raw: RawExternal): NormalisedListing | null {
  const externalId = str(pick(raw, "id", "externalId", "listingId", "propertyId", "reference", "ref"))
    ?? str(pick(raw, "url", "sourceUrl", "link"));
  if (!externalId) return null;

  const title = str(pick(raw, "title", "name", "headline", "propertyTitle"));
  if (!title) return null;

  const priceRaw = str(pick(raw, "priceText", "price_display", "priceFormatted", "price"));
  const address = pick(raw, "address", "fullAddress", "street", "location");

  return {
    externalId,
    sourceUrl: str(pick(raw, "url", "sourceUrl", "link", "detailUrl")),
    sourceSite: str(pick(raw, "source", "site", "portal", "marketplace", "domain")),
    title,
    description: str(pick(raw, "description", "summary", "text", "body")),
    kind: parseKind(raw),
    price: parsePrice(pick(raw, "price", "priceValue", "amount", "priceText")),
    currency: parseCurrency(pick(raw, "currency", "currencyCode"), priceRaw),
    priceRaw,
    country: str(pick(raw, "country", "countryCode"))?.slice(0, 2).toUpperCase()
      ?? str(pick(raw, "country"))?.toUpperCase()
      ?? null,
    city: str(pick(raw, "city", "town", "locality", "municipality")),
    district: str(pick(raw, "district", "neighbourhood", "neighborhood", "area", "region")),
    address: typeof address === "string" ? address.trim() || null : null,
    latitude: typeof pick(raw, "latitude", "lat") === "number" ? (pick(raw, "latitude", "lat") as number) : null,
    longitude: typeof pick(raw, "longitude", "lng", "lon") === "number" ? (pick(raw, "longitude", "lng", "lon") as number) : null,
    bedrooms: parseInt_(pick(raw, "bedrooms", "beds", "rooms", "numberOfRooms")),
    bathrooms: parseInt_(pick(raw, "bathrooms", "baths", "numberOfBathrooms")),
    areaSqm: parseArea(raw),
    amenities: Array.isArray(pick(raw, "amenities", "features", "facilities"))
      ? (pick(raw, "amenities", "features", "facilities") as unknown[])
          .map((a) => str(a)).filter((a): a is string => Boolean(a)).slice(0, 40)
      : [],
    images: parseImages(raw),
    agentName: str(pick(raw, "agentName", "agent", "contactName")),
    agentPhone: str(pick(raw, "agentPhone", "phone", "contactPhone", "telephone")),
    agentEmail: str(pick(raw, "agentEmail", "email", "contactEmail")),
    agencyName: str(pick(raw, "agency", "agencyName", "company", "brand")),
  };
}
