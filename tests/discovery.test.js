/**
 * Which rows the shopfront shows, under test.
 *
 * The failure this exists for happened on the live site: the demo generator was
 * removed, three real listings remained, no theme reached the three-per-row bar,
 * and the front page of a marketplace holding three published properties said
 * "Nothing listed yet". Every claim here is about the catalogue, so every one of
 * them can be wrong in that direction.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDiscoveryRows, MIN_PER_ROW, MAX_ROWS,
} = require("../.test-build/lib/marketplace/discovery.js");

const EN = JSON.parse(require("node:fs").readFileSync(
  require("node:path").join(__dirname, "../src/lib/i18n/messages/en.json"), "utf8"));

let n = 0;
const listing = (over = {}) => ({
  id: `l${++n}`, name: `Listing ${n}`, type: "apartment", location: "Somewhere",
  city: "Nairobi", country: "", price: 10000, currency: "KES", rating: 0, reviewCount: 0,
  beds: 1, baths: 1, maxGuests: 2, amenities: [], imageUrl: "/x.png", gallery: ["/x.png"],
  superhost: false, hostId: "Host", description: "", bookable: true, kind: "STAY", ...over,
});

test("an empty catalogue produces no rows at all", () => {
  assert.deepEqual(buildDiscoveryRows([]), []);
});

test("inventory always produces a row, however little of it there is", () => {
  // The live failure: three listings, one of each kind, nothing reaching the
  // per-row bar — and the page announcing an empty catalogue over them.
  const few = [listing({ kind: "STAY" }), listing({ kind: "RENT" }), listing({ kind: "SALE" })];
  const rows = buildDiscoveryRows(few);
  assert.ok(rows.length >= 1, "a shopfront holding property must not show none");
  assert.equal(rows.flatMap((r) => r.items).length, 3, "and must show all of it");

  for (let i = 1; i <= 3; i++) {
    const rows = buildDiscoveryRows(Array.from({ length: i }, () => listing()));
    assert.ok(rows.length >= 1, `${i} listing(s) still produced no row`);
  }
});

test("a themed row needs enough listings to be worth scrolling", () => {
  // Two stays and two rentals, and no city between them, so no theme qualifies
  // and none is shown as a near-empty track — but the catalogue is still
  // displayed. (With a city they share, that row would qualify on four, which
  // is correct and is why this fixture states no city.)
  const rows = buildDiscoveryRows([
    listing({ kind: "STAY", city: "" }), listing({ kind: "STAY", city: "" }),
    listing({ kind: "RENT", city: "" }), listing({ kind: "RENT", city: "" }),
  ]);
  assert.equal(rows.length, 1, "expected the fallback row only");
  assert.equal(rows[0].key, "all", "a theme covering everything is not a theme");
  for (const r of buildDiscoveryRows(Array.from({ length: 30 }, (_, i) =>
    listing({ price: 1000 * (i + 1) })))) {
    assert.ok(r.items.length >= MIN_PER_ROW, `${r.key} is too thin to be a row`);
  }
});

test("a real catalogue fills the page without repeating a row", () => {
  // Thirteen rows down the page is the shape of the shopfront; the rule is that
  // each has to earn its place from inventory that exists.
  const many = [
    ...Array.from({ length: 9 }, (_, i) => listing({
      kind: "STAY", city: "Nairobi", price: 5000 + i * 900, maxGuests: 4,
      amenities: ["wifi", "parking", "backup power"], publishedAt: `2026-0${(i % 9) + 1}-01`,
    })),
    ...Array.from({ length: 6 }, (_, i) => listing({
      kind: "RENT", city: "Mombasa", price: 40000 + i * 5000,
      amenities: ["wifi", "24h security", "sea view"],
    })),
    ...Array.from({ length: 4 }, () => listing({
      kind: "SALE", city: "Kwale", price: 20_000_000, amenities: ["parking", "workspace"],
    })),
  ];
  const rows = buildDiscoveryRows(many, { marketCities: ["Nairobi"], marketName: "Kenya" });

  assert.ok(rows.length >= 8, `a 19-listing catalogue only made ${rows.length} rows`);
  assert.ok(rows.length <= MAX_ROWS, `${rows.length} rows is more page than anyone scrolls`);

  // The same listing may appear in several rows — "Good value" and "In Nairobi"
  // are views, not buckets — but two rows must not hold the identical set.
  const sigs = rows.map((r) => r.items.map((l) => l.id).sort().join(","));
  assert.equal(new Set(sigs).size, sigs.length, "two rows are showing exactly the same cards");
  assert.ok(
    rows.some((r) => r.items.some((l) => rows.some((o) => o !== r && o.items.includes(l)))),
    "rows are views over one catalogue, so overlap is expected",
  );
});

test("a row nobody has stayed in does not claim to be well reviewed", () => {
  const rows = buildDiscoveryRows(Array.from({ length: 8 }, () => listing({ reviewCount: 0, rating: 0 })));
  assert.ok(!rows.some((r) => r.key === "popular"), "reviews are the one thing we cannot manufacture");
});

test("themes appear once there is depth, and the fallback then steps aside", () => {
  const rows = buildDiscoveryRows([
    ...Array.from({ length: 4 }, () => listing({ kind: "STAY" })),
    ...Array.from({ length: 3 }, () => listing({ kind: "RENT" })),
  ]);
  assert.ok(rows.some((r) => r.key === "stays"), "four stays should make a stays row");
  assert.ok(rows.some((r) => r.key === "rentals"), "and three rentals a rentals row");
  assert.ok(!rows.some((r) => r.key === "all"), "the catch-all is for when nothing else fits");
});

test("cities lead with the one we have most of", () => {
  // City and kind are deliberately not correlated here: if every Mombasa
  // listing were a rental, "In Mombasa" and "Homes to rent" would hold the
  // identical cards and the second would rightly be dropped as a duplicate.
  const rows = buildDiscoveryRows([
    ...Array.from({ length: 2 }, () => listing({ city: "Mombasa", kind: "RENT" })),
    listing({ city: "Mombasa", kind: "STAY" }),
    ...Array.from({ length: 3 }, () => listing({ city: "Nairobi", kind: "SALE" })),
    ...Array.from({ length: 2 }, () => listing({ city: "Nairobi", kind: "STAY" })),
  ]);
  const cities = rows.filter((r) => r.key.startsWith("city:")).map((r) => r.values.city);
  assert.deepEqual(cities, ["Nairobi", "Mombasa"], "best-stocked city first");
});

test("a listing with no city is not filed under one", () => {
  const rows = buildDiscoveryRows(Array.from({ length: 4 }, () => listing({ city: "" })));
  assert.ok(!rows.some((r) => r.key.startsWith("city:")), "an empty city is not a place");
});

test("every row names itself with a message English defines", () => {
  // A row heading that renders as "discover.luxury.title" is worse than no row.
  const rows = buildDiscoveryRows([
    ...Array.from({ length: 8 }, (_, i) => listing({
      kind: "STAY", city: i % 2 ? "Nairobi" : "Mombasa", price: 1000 * (i + 1),
      maxGuests: 4, amenities: ["wifi", "parking"], publishedAt: `2026-0${(i % 9) + 1}-01`,
      reviewCount: i, rating: 4 + i / 10,
    })),
    ...Array.from({ length: 4 }, () => listing({
      kind: "RENT", city: "Nairobi", price: 60000, amenities: ["24h security", "backup power"],
    })),
    ...Array.from({ length: 3 }, () => listing({
      kind: "SALE", city: "Kwale", price: 20_000_000, amenities: ["sea view", "workspace"],
    })),
  ], { marketCities: ["Nairobi", "Mombasa"], marketName: "Kenya" });
  assert.ok(rows.length >= 8, `only ${rows.length} rows from a full catalogue`);
  assert.ok(rows.length <= MAX_ROWS, "more rows than the page is meant to carry");
  for (const r of rows) {
    assert.ok(r.titleKey in EN, `${r.titleKey} is not defined in English`);
    assert.ok(r.subtitleKey in EN, `${r.subtitleKey} is not defined in English`);
    // A heading that interpolates a place must be given one.
    for (const name of (EN[r.titleKey].match(/\{(\w+)\}/g) ?? [])) {
      const key = name.slice(1, -1);
      assert.ok(r.values && key in r.values, `${r.titleKey} needs ${key}, and got nothing`);
    }
  }
});

test("row keys are unique, so React does not collapse two of them", () => {
  const rows = buildDiscoveryRows([
    ...Array.from({ length: 3 }, () => listing({ city: "Nairobi" })),
    ...Array.from({ length: 3 }, () => listing({ city: "Mombasa" })),
    ...Array.from({ length: 3 }, () => listing({ city: "Kisumu" })),
  ]);
  const keys = rows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, `duplicate row key in ${keys.join(", ")}`);
});
