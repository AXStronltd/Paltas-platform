/**
 * Locales and markets for paltas.io.
 *
 * Two separate ideas, deliberately kept apart:
 *
 *   **Locale** is the language you read in. A Lithuanian living in Stockholm may
 *   want Lithuanian text about Swedish properties.
 *   **Market** is the country whose properties, currency, rules and conventions
 *   you are looking at.
 *
 *   Conflating them is the commonest failure in "global" platforms: switch to
 *   Swedish and suddenly you are shown Swedish listings and can no longer find
 *   the flat in Vilnius you were booking. Here the two are chosen independently.
 */

export type LocaleCode = "en" | "sv" | "lt";
export type MarketCode = "KE" | "SE" | "LT";

export interface Locale {
  code: LocaleCode;
  /** The BCP-47 tag handed to Intl. */
  tag: string;
  /** In the language itself — never translated. */
  nativeName: string;
  englishName: string;
  /** Right-to-left scripts need different layout; none of these are. */
  rtl: boolean;
}

export const LOCALES: Locale[] = [
  { code: "en", tag: "en-GB", nativeName: "English", englishName: "English", rtl: false },
  { code: "sv", tag: "sv-SE", nativeName: "Svenska", englishName: "Swedish", rtl: false },
  { code: "lt", tag: "lt-LT", nativeName: "Lietuvių", englishName: "Lithuanian", rtl: false },
];

export const DEFAULT_LOCALE: LocaleCode = "en";

export interface Market {
  code: MarketCode;
  name: string;
  /** ISO 4217. Prices are held in each market's own currency, not converted. */
  currency: string;
  /** The locale a visitor from here gets unless they have chosen otherwise. */
  defaultLocale: LocaleCode;
  /** Local convention, not a translation — used in address forms and filters. */
  regionLabel: string;
  /** What people actually search for here. */
  popularCities: string[];
  /** Payment methods that matter locally, in the order they matter. */
  paymentMethods: string[];
  /**
   * The tenancy rule a renter in this market will ask about first. Stated per
   * market because getting it wrong is a legal problem, not a copy problem.
   */
  tenancyNote: string;
  /** Where VAT or its equivalent sits in a displayed price. */
  taxLabel: string;
}

/**
 * Markets are data, not code branches. Adding Norway is a new entry here plus a
 * message catalogue — not a search through components for `if (country === …)`.
 */
export const MARKETS: Market[] = [
  {
    code: "KE",
    name: "Kenya",
    currency: "KES",
    defaultLocale: "en",
    regionLabel: "County",
    popularCities: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Diani"],
    paymentMethods: ["M-Pesa", "Card", "Bank transfer"],
    tenancyNote:
      "Deposits are commonly two months' rent and are refundable on satisfactory exit.",
    taxLabel: "VAT",
  },
  {
    code: "SE",
    name: "Sverige",
    currency: "SEK",
    defaultLocale: "sv",
    regionLabel: "Län",
    popularCities: ["Stockholm", "Göteborg", "Malmö", "Uppsala", "Visby"],
    paymentMethods: ["Swish", "Kort", "Bankgiro"],
    tenancyNote:
      "Andrahandsuthyrning kräver tillstånd från hyresvärden eller bostadsrättsföreningen.",
    taxLabel: "Moms",
  },
  {
    code: "LT",
    name: "Lietuva",
    currency: "EUR",
    defaultLocale: "lt",
    regionLabel: "Apskritis",
    popularCities: ["Vilnius", "Kaunas", "Klaipėda", "Šiauliai", "Palanga"],
    paymentMethods: ["Kortelė", "Bankinis pavedimas", "Paysera"],
    tenancyNote:
      "Nuomos sutartis ilgesnė nei vieneriems metams turi būti registruojama Registrų centre.",
    taxLabel: "PVM",
  },
];

export const DEFAULT_MARKET: MarketCode = "KE";

export function isLocale(value: string | null | undefined): value is LocaleCode {
  return !!value && LOCALES.some((l) => l.code === value);
}

export function isMarket(value: string | null | undefined): value is MarketCode {
  return !!value && MARKETS.some((m) => m.code === value);
}

export function localeOf(code: LocaleCode): Locale {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

export function marketOf(code: MarketCode): Market {
  return MARKETS.find((m) => m.code === code) ?? MARKETS[0];
}

/**
 * Pick a locale from an `Accept-Language` header.
 *
 * Honours quality values, and matches `sv-FI` to `sv` — a Swedish speaker in
 * Finland should get Swedish, not fall through to English. Returns null rather
 * than a default so the caller decides what "no preference" means; a header we
 * cannot satisfy is not the same as a header asking for English.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): LocaleCode | null {
  if (!acceptLanguage) return null;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number(q.split("=")[1]) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    if (tag === "*") return null;
    const base = tag.split("-")[0];
    const match = LOCALES.find((l) => l.code === base);
    if (match) return match.code;
  }
  return null;
}

/**
 * Pick a market from a country code — typically the CDN's geo header.
 * An unrecognised country is not an error; it simply means we have no market
 * there yet, and the caller falls back rather than guessing.
 */
export function marketForCountry(country: string | null | undefined): MarketCode | null {
  if (!country) return null;
  const upper = country.toUpperCase();
  return isMarket(upper) ? upper : null;
}

/**
 * Resolve what a visitor should see, in priority order:
 *
 *   1. What they explicitly chose, if anything.
 *   2. Their browser's stated language, and the market of the country they are in.
 *   3. The defaults.
 *
 * An explicit choice always outranks a signal about them — someone who has
 * clicked "English" means it, however their browser is configured.
 */
export function resolvePreferences(input: {
  chosenLocale?: string | null;
  chosenMarket?: string | null;
  acceptLanguage?: string | null;
  country?: string | null;
}): { locale: LocaleCode; market: MarketCode; source: { locale: string; market: string } } {
  if (isLocale(input.chosenLocale)) {
    const market = isMarket(input.chosenMarket)
      ? input.chosenMarket
      : marketForCountry(input.country) ?? DEFAULT_MARKET;
    return {
      locale: input.chosenLocale,
      market,
      source: { locale: "chosen", market: isMarket(input.chosenMarket) ? "chosen" : input.country ? "country" : "default" },
    };
  }

  const market = isMarket(input.chosenMarket)
    ? input.chosenMarket
    : marketForCountry(input.country) ?? DEFAULT_MARKET;

  // No stated language: prefer the browser's, then the market's own.
  const negotiated = negotiateLocale(input.acceptLanguage);
  const locale = negotiated ?? marketOf(market).defaultLocale;

  return {
    locale,
    market,
    source: {
      locale: negotiated ? "browser" : "market",
      market: isMarket(input.chosenMarket) ? "chosen" : input.country ? "country" : "default",
    },
  };
}
