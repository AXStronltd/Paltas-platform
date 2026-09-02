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

  // A country we do not serve falls back rather than guessing.
  const de = L.resolvePreferences({ country: "DE" });
  assert.equal(de.market, L.DEFAULT_MARKET);
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
