/**
 * Country → currency, for the whole world.
 *
 * The one thing `Intl` cannot answer. It will format any currency for any
 * reader and name any country in any language, but there is no standard API
 * asking "what does Nigeria trade in?" — so that mapping lives here.
 *
 * This is what makes the platform global rather than a list of supported
 * countries. A visitor from anywhere gets their own currency and their own
 * conventions; the curated markets in `locales.ts` then add local depth on top
 * for the places we actually know something about.
 *
 * ISO 3166-1 alpha-2 → ISO 4217.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  // Africa
  DZ: "DZD", AO: "AOA", BJ: "XOF", BW: "BWP", BF: "XOF", BI: "BIF", CM: "XAF",
  CV: "CVE", CF: "XAF", TD: "XAF", KM: "KMF", CD: "CDF", CG: "XAF", CI: "XOF",
  DJ: "DJF", EG: "EGP", GQ: "XAF", ER: "ERN", SZ: "SZL", ET: "ETB", GA: "XAF",
  GM: "GMD", GH: "GHS", GN: "GNF", GW: "XOF", KE: "KES", LS: "LSL", LR: "LRD",
  LY: "LYD", MG: "MGA", MW: "MWK", ML: "XOF", MR: "MRU", MU: "MUR", MA: "MAD",
  MZ: "MZN", NA: "NAD", NE: "XOF", NG: "NGN", RW: "RWF", ST: "STN", SN: "XOF",
  SC: "SCR", SL: "SLE", SO: "SOS", ZA: "ZAR", SS: "SSP", SD: "SDG", TZ: "TZS",
  TG: "XOF", TN: "TND", UG: "UGX", ZM: "ZMW", ZW: "ZWG",

  // Middle East
  BH: "BHD", IQ: "IQD", IR: "IRR", IL: "ILS", JO: "JOD", KW: "KWD", LB: "LBP",
  OM: "OMR", PS: "ILS", QA: "QAR", SA: "SAR", SY: "SYP", TR: "TRY", AE: "AED",
  YE: "YER",

  // Asia
  AF: "AFN", AM: "AMD", AZ: "AZN", BD: "BDT", BT: "BTN", BN: "BND", KH: "KHR",
  CN: "CNY", GE: "GEL", HK: "HKD", IN: "INR", ID: "IDR", JP: "JPY", KZ: "KZT",
  KG: "KGS", LA: "LAK", MO: "MOP", MY: "MYR", MV: "MVR", MN: "MNT", MM: "MMK",
  NP: "NPR", KP: "KPW", PK: "PKR", PH: "PHP", SG: "SGD", KR: "KRW", LK: "LKR",
  TW: "TWD", TJ: "TJS", TH: "THB", TM: "TMT", UZ: "UZS", VN: "VND",

  // Europe — euro area
  AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR", FR: "EUR",
  DE: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LV: "EUR", LT: "EUR", LU: "EUR",
  MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR", SI: "EUR", ES: "EUR", MC: "EUR",
  ME: "EUR", AD: "EUR", SM: "EUR", VA: "EUR", XK: "EUR",
  // Europe — other
  AL: "ALL", BY: "BYN", BA: "BAM", BG: "BGN", CZ: "CZK", DK: "DKK", FO: "DKK",
  GI: "GIP", HU: "HUF", IS: "ISK", LI: "CHF", MD: "MDL", MK: "MKD", NO: "NOK",
  PL: "PLN", RO: "RON", RU: "RUB", RS: "RSD", SE: "SEK", CH: "CHF", UA: "UAH",
  GB: "GBP", JE: "GBP", GG: "GBP", IM: "GBP",

  // Americas
  AG: "XCD", AR: "ARS", AW: "AWG", BS: "BSD", BB: "BBD", BZ: "BZD", BM: "BMD",
  BO: "BOB", BR: "BRL", CA: "CAD", KY: "KYD", CL: "CLP", CO: "COP", CR: "CRC",
  CU: "CUP", CW: "ANG", DM: "XCD", DO: "DOP", EC: "USD", SV: "USD", GD: "XCD",
  GT: "GTQ", GY: "GYD", HT: "HTG", HN: "HNL", JM: "JMD", MX: "MXN", NI: "NIO",
  PA: "PAB", PY: "PYG", PE: "PEN", PR: "USD", KN: "XCD", LC: "XCD", VC: "XCD",
  SR: "SRD", TT: "TTD", TC: "USD", US: "USD", UY: "UYU", VE: "VES", VG: "USD",

  // Oceania
  AU: "AUD", FJ: "FJD", KI: "AUD", MH: "USD", FM: "USD", NR: "AUD", NZ: "NZD",
  PW: "USD", PG: "PGK", WS: "WST", SB: "SBD", TO: "TOP", TV: "AUD", VU: "VUV",
  NC: "XPF", PF: "XPF",
};

/**
 * Country → the language most likely to be wanted there.
 *
 * Only used when the browser states no preference, which is rare — a real
 * `Accept-Language` header always wins. Deliberately incomplete: anything not
 * listed falls through to English, which is a better guess than nothing and
 * never overrides what the visitor actually asked for.
 */
export const COUNTRY_LANGUAGE: Record<string, string> = {
  SE: "sv", LT: "lt",
  // Everywhere else currently reads in English, because those are the only two
  // non-English catalogues that exist. Adding a language is a catalogue plus a
  // line here — the market list does not change.
};

/** Whether we hold a currency for this country. */
export function currencyForCountry(code: string): string | null {
  return COUNTRY_CURRENCY[code.toUpperCase()] ?? null;
}

/**
 * How many countries are covered. Used by a test, so a truncated paste or a
 * bad merge that halves this table is caught rather than shipped.
 */
export const COUNTRY_COUNT = Object.keys(COUNTRY_CURRENCY).length;
