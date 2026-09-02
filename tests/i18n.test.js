/**
 * Locales, markets and translation, under test.
 *
 * The failures this guards against are the ones that make a "global" platform
 * embarrassing rather than merely rough: a catalogue that quietly falls back to
 * English for a year, a plural that reads wrong in a language with three forms,
 * and — worst — a price shown in the wrong currency because someone changed
 * language.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../.test-build/lib/i18n/locales.js");
const T = require("../.test-build/lib/i18n/translate.js");

test("every locale has every key the source language defines", () => {
  // Catalogue rot: a key added in English and never translated.
  for (const locale of L.LOCALES) {
    assert.deepEqual(T.missingKeys(locale.code), [],
      `${locale.code} is missing keys`);
  }
});

test("no locale carries stale keys the source language dropped", () => {
  for (const locale of L.LOCALES) {
    assert.deepEqual(T.orphanKeys(locale.code), [],
      `${locale.code} has keys no longer used`);
  }
});

test("machine translations are declared as such", () => {
  // Not a failure — an honesty check. These must be marked for native review
  // rather than passed off as finished.
  const unreviewed = T.unreviewedLocales();
  assert.ok(!unreviewed.includes("en"), "the source language is native by definition");
  assert.ok(unreviewed.includes("sv") && unreviewed.includes("lt"),
    "sv and lt are machine-authored and must say so");
});

test("Accept-Language is honoured, including quality values", () => {
  assert.equal(L.negotiateLocale("sv-SE,sv;q=0.9,en;q=0.8"), "sv");
  assert.equal(L.negotiateLocale("en-GB,en;q=0.9"), "en");
  assert.equal(L.negotiateLocale("lt-LT"), "lt");
  // A Swedish speaker in Finland gets Swedish, not a fall-through to English.
  assert.equal(L.negotiateLocale("sv-FI"), "sv");
  // Quality ordering wins over document order.
  assert.equal(L.negotiateLocale("de;q=0.9,lt;q=1.0"), "lt");
  // Nothing we serve.
  assert.equal(L.negotiateLocale("de-DE,fr;q=0.8"), null);
  assert.equal(L.negotiateLocale("*"), null);
  assert.equal(L.negotiateLocale(""), null);
  assert.equal(L.negotiateLocale(null), null);
  // q=0 means "not this one".
  assert.equal(L.negotiateLocale("sv;q=0,en;q=0.5"), "en");
});

test("an explicit choice always outranks a signal about the visitor", () => {
  // Someone who clicked "English" means it, whatever their browser says.
  const r = L.resolvePreferences({
    chosenLocale: "en",
    acceptLanguage: "sv-SE,sv;q=0.9",
    country: "SE",
  });
  assert.equal(r.locale, "en");
  assert.equal(r.source.locale, "chosen");
  // The market still follows the country they are in.
  assert.equal(r.market, "SE");
});

test("language and market are chosen independently", () => {
  // A Lithuanian in Stockholm: Lithuanian text, Swedish properties.
  const r = L.resolvePreferences({ chosenLocale: "lt", chosenMarket: "SE" });
  assert.equal(r.locale, "lt");
  assert.equal(r.market, "SE");
  // And the reverse.
  const r2 = L.resolvePreferences({ chosenLocale: "sv", chosenMarket: "LT" });
  assert.equal(r2.locale, "sv");
  assert.equal(r2.market, "LT");
});

test("with no signals at all, the defaults apply", () => {
  const r = L.resolvePreferences({});
  assert.equal(r.locale, L.DEFAULT_LOCALE);
  assert.equal(r.market, L.DEFAULT_MARKET);
});

test("a visitor from a market we serve gets its language by default", () => {
  const se = L.resolvePreferences({ country: "SE" });
  assert.equal(se.market, "SE");
  assert.equal(se.locale, "sv", "no browser preference, so the market's own language");

  const lt = L.resolvePreferences({ country: "LT" });
  assert.equal(lt.locale, "lt");

  // Any country we can price resolves to itself. Falling back to the default
  // here is what used to quote a German visitor in Kenyan shillings.
  const de = L.resolvePreferences({ country: "DE" });
  assert.equal(de.market, "DE");
  assert.equal(L.marketOf("DE").currency, "EUR");

  // Only something genuinely unpriceable falls back.
  assert.equal(L.resolvePreferences({ country: "ZZ" }).market, L.DEFAULT_MARKET);
});

test("plurals use each language's own rules", () => {
  const en = T.createTranslator("en", "KE");
  assert.equal(en.t("price.forNights", { count: 1 }), "for 1 night");
  assert.equal(en.t("price.forNights", { count: 3 }), "for 3 nights");

  const sv = T.createTranslator("sv", "SE");
  assert.equal(sv.t("price.forNights", { count: 1 }), "för 1 natt");
  assert.equal(sv.t("price.forNights", { count: 3 }), "för 3 nätter");

  // Lithuanian has three categories; 2 is "few", 10 is "other".
  const lt = T.createTranslator("lt", "LT");
  const one = lt.t("price.forNights", { count: 1 });
  const few = lt.t("price.forNights", { count: 2 });
  const other = lt.t("price.forNights", { count: 10 });
  assert.ok(one.includes("naktį"), `one form: ${one}`);
  assert.ok(few.includes("naktis"), `few form: ${few}`);
  assert.ok(other.includes("naktų"), `other form: ${other}`);
  assert.notEqual(few, other, "few and other must differ in Lithuanian");
});

test("the tax label follows the market, not the language", () => {
  // A Swede reading Swedish about a Kenyan property sees VAT, not Moms.
  assert.equal(T.createTranslator("sv", "KE").t("price.taxes"), "VAT");
  assert.equal(T.createTranslator("sv", "SE").t("price.taxes"), "Moms");
  assert.equal(T.createTranslator("en", "LT").t("price.taxes"), "PVM");
});

test("money is formatted for the reader but never converted", () => {
  const sv = T.createTranslator("sv", "SE");
  const en = T.createTranslator("en", "KE");

  // Same number, each market's own currency — no exchange rate is invented.
  const inSek = sv.money(1500);
  const inKes = en.money(1500);
  assert.ok(/1\s?500/.test(inSek.replace(/ | /g, " ")), `SEK: ${inSek}`);
  assert.ok(inSek.toLowerCase().includes("kr"), `SEK symbol missing: ${inSek}`);
  assert.ok(inKes.includes("1,500") || inKes.includes("1 500"), `KES: ${inKes}`);

  // An explicit currency overrides the market's, for cross-market listings.
  const eur = sv.money(1500, "EUR");
  assert.ok(eur.includes("€") || eur.toLowerCase().includes("eur"), `EUR: ${eur}`);
});

test("numbers and dates follow the reader's conventions", () => {
  const sv = T.createTranslator("sv", "SE");
  const en = T.createTranslator("en", "KE");
  // Swedish groups with a space, English with a comma.
  assert.notEqual(sv.number(1234567), en.number(1234567));
  const d = new Date("2026-09-02T12:00:00Z");
  assert.notEqual(sv.date(d, "long"), en.date(d, "long"));
  assert.ok(sv.date(d, "long").includes("2026"));
});

test("a missing key falls back visibly rather than silently", () => {
  const lt = T.createTranslator("lt", "LT");
  // Not in any catalogue: returns the key, which reads as a bug rather than
  // rendering an empty string nobody notices.
  assert.equal(lt.t("nonexistent.key"), "nonexistent.key");
});

test("markets are data, and each carries what a local actually needs", () => {
  for (const m of L.MARKETS) {
    assert.ok(m.currency.length === 3, `${m.code} needs an ISO 4217 currency`);
    assert.ok(m.popularCities.length >= 3, `${m.code} needs cities people search for`);
    assert.ok(m.paymentMethods.length >= 2, `${m.code} needs local payment methods`);
    assert.ok(m.tenancyNote.length > 20, `${m.code} needs a real tenancy note`);
    assert.ok(L.LOCALES.some((l) => l.code === m.defaultLocale), `${m.code} default locale must exist`);
  }
  // The three markets named do not share a currency — no accidental copy-paste.
  const currencies = new Set(L.MARKETS.map((m) => m.currency));
  assert.equal(currencies.size, L.MARKETS.length);
});

test("every market is self-describing, so adding one needs no code changes", () => {
  // The point of markets-as-data: a new country is an entry, not a branch. This
  // holds each entry to what a local visitor actually needs to see.
  for (const m of L.MARKETS) {
    assert.match(m.code, /^[A-Z]{2}$/, `${m.code} should be an ISO 3166 code`);
    assert.match(m.currency, /^[A-Z]{3}$/, `${m.code} needs an ISO 4217 currency`);
    assert.ok(m.name.length > 1, `${m.code} needs a display name`);
    assert.ok(m.popularCities.length >= 3, `${m.code} needs cities people search for`);
    assert.ok(m.paymentMethods.length >= 2, `${m.code} needs local payment methods`);
    assert.ok(m.tenancyNote.length > 30, `${m.code} needs a real tenancy note`);
    assert.ok(m.taxLabel.length > 0, `${m.code} needs a tax label`);
    assert.ok(L.LOCALES.some((l) => l.code === m.defaultLocale),
      `${m.code} defaults to a locale that must exist`);
  }
});

test("no two markets share a currency or a code", () => {
  const codes = L.MARKETS.map((m) => m.code);
  const currencies = L.MARKETS.map((m) => m.currency);
  assert.equal(new Set(codes).size, codes.length, "duplicate market code");
  assert.equal(new Set(currencies).size, currencies.length,
    "two markets share a currency — likely a copy-paste");
});

test("a market whose language we do not serve still works", () => {
  // Saudi Arabia and the UAE default to English because Arabic is right-to-left
  // and that layout work has not been done. The market must still be complete.
  for (const code of ["SA", "AE"]) {
    const m = L.marketOf(code);
    assert.equal(m.defaultLocale, "en");
    const t = T.createTranslator("en", code);
    assert.equal(t.t("price.taxes"), m.taxLabel);
    assert.ok(t.money(1000).length > 0, `${code} must format its own currency`);
  }
});

test("each market formats its own currency distinctly", () => {
  const seen = new Set();
  for (const m of L.MARKETS) {
    const formatted = T.createTranslator(m.defaultLocale, m.code).money(1234);
    assert.ok(formatted.length > 0, `${m.code} produced nothing`);
    seen.add(formatted);
  }
  assert.equal(seen.size, L.MARKETS.length, "two markets format money identically");
});

const C = require("../.test-build/lib/i18n/countries.js");

test("the platform prices any country, not a supported list", () => {
  // The failure this replaces: an unknown country fell back to Kenya, so a
  // visitor from Lagos was quoted in Kenyan shillings.
  assert.ok(C.COUNTRY_COUNT > 190, `only ${C.COUNTRY_COUNT} countries mapped`);
  for (const cc of ["NG", "BR", "JP", "IN", "DE", "AU", "PK", "EG", "US", "CN"]) {
    assert.equal(L.marketForCountry(cc), cc, `${cc} should resolve to itself`);
    const m = L.marketOf(cc);
    assert.equal(m.code, cc);
    assert.match(m.currency, /^[A-Z]{3}$/, `${cc} needs a real currency`);
    assert.ok(m.name.length > 1 && m.name !== cc, `${cc} should be named, got "${m.name}"`);
  }
});

test("a derived market is honest about knowing nothing local", () => {
  const ng = L.marketOf("NG");
  assert.equal(ng.curated, false);
  assert.equal(ng.currency, "NGN");
  // Empty rather than invented: a made-up letting rule is worse than none.
  assert.deepEqual(ng.popularCities, []);
  assert.deepEqual(ng.paymentMethods, []);
  assert.equal(ng.tenancyNote, "");
});

test("curated markets keep their local knowledge", () => {
  for (const code of ["KE", "SE", "SA", "AE", "GB", "LT", "TZ", "UG"]) {
    const m = L.marketOf(code);
    assert.equal(m.curated, true, `${code} should be curated`);
    assert.ok(m.popularCities.length >= 3, `${code} lost its cities`);
    assert.ok(m.paymentMethods.length >= 2, `${code} lost its payment methods`);
    assert.ok(m.tenancyNote.length > 30, `${code} lost its tenancy note`);
  }
});

test("country names follow the reader's language", () => {
  assert.equal(L.marketOf("JP", "en").name, "Japan");
  assert.notEqual(L.marketOf("JP", "lt").name, "Japan", "should be localised");
  assert.ok(L.marketOf("JP", "lt").name.length > 1);
});

test("every mapped currency actually formats", () => {
  // A typo in the table would otherwise surface as a runtime crash on a page.
  const bad = [];
  for (const [cc, cur] of Object.entries(C.COUNTRY_CURRENCY)) {
    try { new Intl.NumberFormat("en", { style: "currency", currency: cur }).format(1); }
    catch { bad.push(`${cc}→${cur}`); }
  }
  assert.deepEqual(bad, [], "invalid currency codes");
});

test("a country we cannot price falls back rather than breaking", () => {
  for (const junk of ["ZZ", "QQ", "", "X", "12", null, undefined]) {
    assert.equal(L.marketForCountry(junk), null, `"${junk}" should not resolve`);
  }
  // And the resolver still returns something usable.
  const r = L.resolvePreferences({ country: "ZZ" });
  assert.equal(r.market, L.DEFAULT_MARKET);
});
