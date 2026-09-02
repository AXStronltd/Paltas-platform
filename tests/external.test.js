/**
 * The licence gate and the normaliser, under test.
 *
 * The gate is the file that stops us publishing a photographer's work
 * commercially without permission. It is worth more tests than almost anything
 * else here, because its failure mode is a legal claim rather than a bug
 * report, and because "we default to not publishing" is exactly the kind of
 * claim that is true when written and quietly false a year later.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const L = require("../.test-build/lib/external/licence.js");
const N = require("../.test-build/lib/external/normalise.js");

const NOW = new Date("2026-09-03T00:00:00Z");

const source = (over = {}) => ({
  key: "test", licenceStatus: "LICENSED", displayRights: true, imageRights: true,
  contactDataRights: true, territories: [], licenceExpiry: null, active: true, ...over,
});

test("with no licence recorded, nothing is displayable", () => {
  const v = L.evaluateLicence(source({ licenceStatus: "NONE" }), {}, NOW);
  assert.equal(v.displayable, false);
  assert.equal(v.images, false);
  assert.equal(v.contact, false);
  assert.match(v.reason, /No licence/i);
});

test("research-only data is never displayed, however complete it is", () => {
  const v = L.evaluateLicence(source({ licenceStatus: "RESEARCH_ONLY" }), {}, NOW);
  assert.equal(v.displayable, false);
  assert.match(v.reason, /research/i);
});

test("a licence can grant facts without granting photographs", () => {
  const v = L.evaluateLicence(source({ imageRights: false }), {}, NOW);
  assert.equal(v.displayable, true, "the facts may be shown");
  assert.equal(v.images, false, "the photographs may not");
  assert.match(v.reason, /without image rights/i);
});

test("agent contact details need their own grant — they are personal data", () => {
  const v = L.evaluateLicence(source({ contactDataRights: false }), {}, NOW);
  assert.equal(v.displayable, true);
  assert.equal(v.contact, false);
});

test("display rights are separate from having a licence at all", () => {
  // A data licence for market analysis is not permission to republish.
  const v = L.evaluateLicence(source({ displayRights: false }), {}, NOW);
  assert.equal(v.displayable, false);
  assert.match(v.reason, /display rights/i);
});

test("an expired licence stops display, it does not linger", () => {
  const expired = L.evaluateLicence(source({ licenceExpiry: new Date("2026-01-01") }), {}, NOW);
  assert.equal(expired.displayable, false);
  assert.match(expired.reason, /expired/i);

  const live = L.evaluateLicence(source({ licenceExpiry: new Date("2027-01-01") }), {}, NOW);
  assert.equal(live.displayable, true);
});

test("a territory-limited licence does not cover other countries", () => {
  const s = source({ territories: ["ES", "PT"] });
  assert.equal(L.evaluateLicence(s, { country: "ES" }, NOW).displayable, true);
  assert.equal(L.evaluateLicence(s, { country: "es" }, NOW).displayable, true, "case-insensitive");
  assert.equal(L.evaluateLicence(s, { country: "KE" }, NOW).displayable, false);
  // An unknown country is refused rather than assumed to be inside the territory.
  const unknown = L.evaluateLicence(s, {}, NOW);
  assert.equal(unknown.displayable, false);
  assert.match(unknown.reason, /territory-limited/i);
});

test("a takedown outranks a valid licence", () => {
  // A rights holder should not have to ask twice because a later sync re-created the row.
  const v = L.evaluateLicence(source(), { suppressed: true }, NOW);
  assert.equal(v.displayable, false);
  assert.match(v.reason, /takedown/i);
});

test("deactivating a source stops display everywhere at once", () => {
  assert.equal(L.evaluateLicence(source({ active: false }), {}, NOW).displayable, false);
});

test("applyLicence removes what is not permitted, rather than hiding it", () => {
  const listing = {
    images: ["https://a.example/1.jpg", "https://a.example/2.jpg"],
    agentName: "Ana Ruiz", agentPhone: "+34 600 000 000", agentEmail: "ana@example.com",
    description: "A flat.",
  };

  const full = L.applyLicence(listing, L.evaluateLicence(source(), {}, NOW));
  assert.equal(full.images.length, 2);
  assert.equal(full.agentName, "Ana Ruiz");

  const noImages = L.applyLicence(listing, L.evaluateLicence(source({ imageRights: false }), {}, NOW));
  assert.deepEqual(noImages.images, [], "not in the payload at all, not merely hidden by CSS");

  const noContact = L.applyLicence(listing, L.evaluateLicence(source({ contactDataRights: false }), {}, NOW));
  assert.equal(noContact.agentName, null);
  assert.equal(noContact.agentPhone, null);
  assert.equal(noContact.agentEmail, null);
});

test("every refusal explains itself", () => {
  for (const over of [
    { licenceStatus: "NONE" }, { licenceStatus: "RESEARCH_ONLY" },
    { displayRights: false }, { active: false }, { licenceExpiry: new Date("2020-01-01") },
  ]) {
    const v = L.evaluateLicence(source(over), {}, NOW);
    assert.equal(v.displayable, false);
    assert.ok(v.reason.length > 10, `a refusal with no explanation: ${JSON.stringify(over)}`);
  }
});

/* ------------------------------ normalising ----------------------------- */

test("prices survive the formats aggregators actually send", () => {
  assert.equal(N.parsePrice(450000), 450000);
  assert.equal(N.parsePrice("450000"), 450000);
  assert.equal(N.parsePrice("€ 450.000"), 450000, "European thousands separator");
  assert.equal(N.parsePrice("1,250,000 AED"), 1250000);
  assert.equal(N.parsePrice("£450,000"), 450000);
  // Prices are stored as whole units, so a decimal comma rounds. Floor area
  // keeps its decimals — see the area test.
  assert.equal(N.parsePrice("450,5"), 451, "decimal comma, rounded to a whole unit");
  assert.equal(N.parseNumber("450,5"), 450.5, "the arithmetic itself keeps the decimal");
  assert.equal(N.parsePrice("1.234.567,89"), 1234568, "both separators, comma decimal");
  assert.equal(N.parsePrice("1,234,567.89"), 1234568, "both separators, dot decimal");
});

test("a price range is refused, not silently reduced to its lower bound", () => {
  assert.equal(N.parsePrice("300000 - 400000"), null);
  assert.equal(N.parsePrice("300000 to 400000"), null);
  assert.equal(N.parsePrice("from 300k"), null, "open-ended");
  assert.equal(N.parsePrice("300k"), null, "a magnitude suffix we will not guess at");
  assert.equal(N.parsePrice("1.2M"), null);
  // "95 m" as a *price* almost certainly means 95 million, so it is refused
  // too. The metric reading only matters for area, which parses separately and
  // does not apply the magnitude guard at all.
  assert.equal(N.parsePrice("95 m"), null, "ambiguous as a price");
  assert.equal(N.parseArea({ area: "95 m²" }), 95, "but unambiguous as an area");
  assert.equal(N.parsePrice("POA"), null);
  assert.equal(N.parsePrice(null), null);
});

test("currency is read from a code or a symbol", () => {
  assert.equal(N.parseCurrency("EUR"), "EUR");
  assert.equal(N.parseCurrency("eur"), "EUR");
  assert.equal(N.parseCurrency(null, "€ 450.000"), "EUR");
  assert.equal(N.parseCurrency(null, "1,250,000 AED"), "AED");
  assert.equal(N.parseCurrency(null, "450000"), null, "no signal, no guess");
});

test("square feet are converted, unknown units are not guessed", () => {
  assert.equal(N.parseArea({ areaSqm: 120 }), 120);
  assert.equal(N.parseArea({ area: "1200 sq ft" }), Math.round(1200 * 0.092903 * 100) / 100);
  assert.equal(N.parseArea({ area: 1200, areaUnit: "sqft" }), Math.round(1200 * 0.092903 * 100) / 100);
  assert.equal(N.parseArea({ area: "95 m²" }), 95, "a unit suffix is not a magnitude suffix");
  assert.equal(N.parseArea({ areaSqm: 95.5 }), 95.5, "area keeps its decimals");
  assert.equal(N.parseArea({}), null);
});

test("the kind of transaction is inferred, not assumed", () => {
  assert.equal(N.parseKind({ operation: "rent" }), "RENT");
  assert.equal(N.parseKind({ title: "Apartment to let in Lisbon" }), "RENT");
  assert.equal(N.parseKind({ title: "Nightly holiday villa" }), "STAY");
  assert.equal(N.parseKind({ title: "3-bed house" }), "SALE");
});

test("images accept the three shapes providers send, and reject relative paths", () => {
  assert.deepEqual(N.parseImages({ images: ["https://a.example/1.jpg"] }), ["https://a.example/1.jpg"]);
  assert.deepEqual(N.parseImages({ photos: [{ url: "https://a.example/2.jpg" }] }), ["https://a.example/2.jpg"]);
  assert.deepEqual(N.parseImages({ media: [{ src: "https://a.example/3.jpg" }] }), ["https://a.example/3.jpg"]);
  // A relative path from someone else's site resolves against ours and 404s.
  assert.deepEqual(N.parseImages({ images: ["/local/4.jpg", "not a url"] }), []);
  // Duplicates would render the same photograph twice in a gallery.
  assert.deepEqual(N.parseImages({ images: ["https://a.example/1.jpg", "https://a.example/1.jpg"] }),
    ["https://a.example/1.jpg"]);
});

test("a record with no id or no title is dropped", () => {
  assert.equal(N.normalise({ title: "No id here" }), null);
  assert.equal(N.normalise({ id: "x1" }), null, "nothing to call it");
});

test("a realistic aggregator record maps end to end", () => {
  const out = N.normalise({
    id: "tf-99812",
    url: "https://example-portal.es/piso/99812",
    source: "idealista",
    title: "Piso de 3 dormitorios en Malasaña",
    description: "Reformado, exterior, tercera planta.",
    operation: "sale",
    price: "€ 585.000",
    currency: "EUR",
    country: "ES",
    city: "Madrid",
    district: "Centro",
    rooms: 3,
    bathrooms: 2,
    area: "95 m²",
    images: ["https://img.example/a.jpg", { url: "https://img.example/b.jpg" }],
    features: ["ascensor", "aire acondicionado"],
    agentName: "Ana Ruiz",
    agentPhone: "+34 600 000 000",
    agency: "Inmobiliaria Centro",
  });

  assert.equal(out.externalId, "tf-99812");
  assert.equal(out.kind, "SALE");
  assert.equal(out.price, 585000);
  assert.equal(out.currency, "EUR");
  assert.equal(out.country, "ES");
  assert.equal(out.bedrooms, 3);
  assert.equal(out.areaSqm, 95);
  assert.equal(out.images.length, 2);
  assert.equal(out.agentName, "Ana Ruiz");
  assert.equal(out.sourceSite, "idealista");
  assert.equal(out.sourceUrl, "https://example-portal.es/piso/99812");
});
