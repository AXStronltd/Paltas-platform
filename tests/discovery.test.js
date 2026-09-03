/**
 * Which rows the shopfront shows, under test.
 *
 * The failure this file exists for happened on the live site: the demo
 * generator was removed, three real listings remained, no theme reached the
 * three-per-row bar, and the front page of a marketplace holding three
 * published properties said "Nothing listed yet".
 *
 * Everything here is a claim about the catalogue — that a place has homes in
 * it, that a weekend is free, that guests liked something — so every one of
 * them can be wrong in a way a visitor would act on.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDiscoveryRows, weekendWindow, nextMonthWindow,
  MIN_PER_ROW, MAX_ROWS, GLOBAL_DESTINATIONS,
} = require("../.test-build/lib/marketplace/discovery.js");

const EN = JSON.parse(require("node:fs").readFileSync(
  require("node:path").join(__dirname, "../src/lib/i18n/messages/en.json"), "utf8"));

let n = 0;
const listing = (over = {}) => ({
  id: `l${++n}`, name: `Listing ${n}`, type: "apartment", location: "Somewhere",
  city: "Nairobi", country: "KE", price: 10000, currency: "KES", rating: 0, reviewCount: 0,
  beds: 1, baths: 1, maxGuests: 2, amenities: [], imageUrl: "/x.png", gallery: ["/x.png"],
  superhost: false, hostId: "Host", description: "", bookable: true, kind: "STAY",
  publishedAt: "2026-01-01", ...over,
});

/** Enough of a world that the page has both a home country and somewhere else. */
const world = () => [
  ...Array.from({ length: 5 }, (_, i) => listing({
    city: "Nairobi", country: "KE", kind: "STAY", price: 6000 + i * 900,
    amenities: ["wifi", "parking"], maxGuests: 4, reviewCount: i + 1, rating: 4.2 + i / 20,
  })),
  ...Array.from({ length: 4 }, () => listing({ city: "Mombasa", country: "KE", kind: "RENT", price: 60000 })),
  ...Array.from({ length: 3 }, () => listing({ city: "Naivasha", country: "KE", kind: "STAY", price: 12000 })),
  ...Array.from({ length: 4 }, () => listing({ city: "Bali", country: "ID", kind: "STAY", price: 2000000, currency: "IDR" })),
  ...Array.from({ length: 3 }, () => listing({ city: "Paris", country: "FR", kind: "STAY", price: 180, currency: "EUR" })),
  ...Array.from({ length: 3 }, () => listing({ city: "Cape Town", country: "ZA", kind: "SALE", price: 8900000, currency: "ZAR" })),
];

const allIds = (ls) => new Set(ls.map((l) => l.id));
const titles = (rows) => rows.map((r) => r.titleKey);

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
    const r = buildDiscoveryRows(Array.from({ length: i }, () => listing()));
    assert.ok(r.length >= 1, `${i} listing(s) still produced no row`);
  }
});

test("a themed row needs enough listings to be worth scrolling", () => {
  for (const r of buildDiscoveryRows(world())) {
    assert.ok(r.items.length >= MIN_PER_ROW, `${r.key} is too thin to be a row`);
  }
});

test("a theme covering the whole catalogue is not a theme", () => {
  // Four stays, one city, no amenities: every candidate theme matches all four,
  // so none of them says anything and the catch-all says it once.
  const rows = buildDiscoveryRows(Array.from({ length: 4 }, () => listing({ city: "" })));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "all");
});

test("no two rows hold exactly the same cards", () => {
  const rows = buildDiscoveryRows(world(), {
    country: "KE", countryName: "Kenya",
  });
  const sigs = rows.map((r) => r.items.map((l) => l.id).sort().join(","));
  assert.equal(new Set(sigs).size, sigs.length, "two rows are showing the identical set");
  const keys = rows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length, `duplicate row key in ${keys.join(", ")}`);
});

test("the page fills up, and stops before it becomes a warehouse", () => {
  const rows = buildDiscoveryRows(world(), {
    country: "KE", countryName: "Kenya",
    availableThisWeekend: allIds(world()),
  });
  assert.ok(rows.length >= 8, `a 22-listing world only made ${rows.length} rows`);
  assert.ok(rows.length <= MAX_ROWS, `${rows.length} rows is more page than anyone scrolls`);
});

test("the visitor's own country leads, before anywhere else on earth", () => {
  const rows = buildDiscoveryRows(world(), { country: "KE", countryName: "Kenya" });
  assert.equal(rows[0].titleKey, "discover.nearYou.title", titles(rows).join(" | "));
  assert.equal(rows[0].values.market, "Kenya");
  assert.ok(
    rows[0].items.every((l) => l.country === "KE"),
    "the row headed with a country contained a listing from somewhere else",
  );
});

test("nearby cities are offered before global destinations", () => {
  const rows = buildDiscoveryRows(world(), { country: "KE", countryName: "Kenya" });
  const place = (r) => r.values?.place;
  const firstGlobal = rows.findIndex((r) => GLOBAL_DESTINATIONS.includes(place(r)));
  const lastLocal = rows.map(place).lastIndexOf("Naivasha");
  assert.ok(firstGlobal > 0, `no global destination row in ${titles(rows).join(" | ")}`);
  assert.ok(lastLocal < firstGlobal, "a global destination outranked the visitor's own city");
});

test("a place row only names a place we actually have listings in", () => {
  const rows = buildDiscoveryRows(world(), { country: "KE", countryName: "Kenya" });
  for (const r of rows) {
    if (!r.values?.place) continue;
    assert.ok(r.items.length > 0, `${r.key} names a place with nothing in it`);
    assert.ok(
      r.items.every((l) => l.city === r.values.place),
      `${r.key} contains a listing that is not in ${r.values.place}`,
    );
  }
});

test("a global destination we have nothing in is never advertised", () => {
  // Only Kenya in the catalogue: Bali and Paris must not appear as headings.
  const kenyaOnly = world().filter((l) => l.country === "KE");
  const rows = buildDiscoveryRows(kenyaOnly, { country: "KE", countryName: "Kenya" });
  for (const r of rows) {
    assert.ok(
      !GLOBAL_DESTINATIONS.includes(r.values?.place),
      `${r.values?.place} was advertised with no inventory behind it`,
    );
  }
});

test("a visitor from elsewhere still meets the world", () => {
  // Someone browsing Sweden, where we have nothing: no local rows, but Bali,
  // Paris and Cape Town are still worth showing them.
  const rows = buildDiscoveryRows(world(), { country: "SE", countryName: "Sweden" });
  const places = rows.map((r) => r.values?.place).filter(Boolean);
  assert.ok(places.length > 0, `no destination rows at all: ${titles(rows).join(" | ")}`);
  assert.ok(
    places.some((p) => GLOBAL_DESTINATIONS.includes(p)),
    `expected a global destination among ${places.join(", ")}`,
  );
});

test("'this weekend' is only offered when the server confirmed it", () => {
  const ls = world();
  const withoutDates = buildDiscoveryRows(ls, { country: "KE", countryName: "Kenya" });
  assert.ok(
    !withoutDates.some((r) => r.titleKey === "row.thisWeekend.title"),
    "a weekend was promised without anything having checked the calendar",
  );

  // Only the Nairobi stays are free; the row may contain those and nothing else.
  const free = new Set(ls.filter((l) => l.city === "Nairobi").map((l) => l.id));
  const rows = buildDiscoveryRows(ls, {
    country: "KE", countryName: "Kenya", availableThisWeekend: free,
  });
  const weekend = rows.find((r) => r.titleKey === "row.thisWeekend.title");
  assert.ok(weekend, `no weekend row in ${titles(rows).join(" | ")}`);
  assert.ok(
    weekend.items.every((l) => free.has(l.id)),
    "the weekend row offered a listing the server did not confirm",
  );
  assert.ok(
    weekend.items.every((l) => l.kind === "STAY"),
    "a house for sale cannot be free for a weekend",
  );
});

test("'next month' is only offered when the server confirmed it", () => {
  const ls = world();
  const free = new Set(ls.filter((l) => l.city === "Bali").map((l) => l.id));
  const rows = buildDiscoveryRows(ls, { country: "KE", countryName: "Kenya", availableNextMonth: free });
  const row = rows.find((r) => r.titleKey === "row.nextMonth.title");
  if (row) {
    assert.ok(row.items.every((l) => free.has(l.id)), "offered a month the server did not confirm");
  }
  // And with nothing confirmed, the row simply is not offered.
  const none = buildDiscoveryRows(ls, { country: "KE", countryName: "Kenya" });
  assert.ok(!none.some((r) => r.titleKey === "row.nextMonth.title"));
});

test("'popular homes' needs guests to have been popular with", () => {
  // Nairobi has reviews in this world; Bali does not.
  const rows = buildDiscoveryRows(world(), { country: "KE", countryName: "Kenya" });
  for (const r of rows) {
    if (r.titleKey !== "row.popularHomes.title") continue;
    assert.ok(
      r.items.every((l) => l.reviewCount > 0),
      `"Popular homes in ${r.values.place}" included something nobody has reviewed`,
    );
  }
  const unreviewed = Array.from({ length: 6 }, () => listing({ city: "Bali", country: "ID", reviewCount: 0 }));
  const none = buildDiscoveryRows(unreviewed, { country: "ID", countryName: "Indonesia" });
  assert.ok(
    !none.some((r) => r.titleKey === "row.popularHomes.title"),
    "called something popular that nobody has reviewed",
  );
});

test("the same city is not worded the same way twice", () => {
  const rows = buildDiscoveryRows(world(), {
    country: "KE", countryName: "Kenya", availableThisWeekend: allIds(world()),
  });
  const byPlace = new Map();
  for (const r of rows) {
    if (!r.values?.place) continue;
    const seen = byPlace.get(r.values.place) ?? [];
    assert.ok(!seen.includes(r.titleKey), `${r.values.place} used ${r.titleKey} twice`);
    byPlace.set(r.values.place, [...seen, r.titleKey]);
  }
});

test("every row names itself with a message English defines", () => {
  // A row heading that renders as "row.stayIn.title" is worse than no row.
  const rows = buildDiscoveryRows(world(), {
    country: "KE", countryName: "Kenya",
    availableThisWeekend: allIds(world()), availableNextMonth: allIds(world()),
  });
  assert.ok(rows.length >= 8);
  for (const r of rows) {
    assert.ok(r.titleKey in EN, `${r.titleKey} is not defined in English`);
    assert.ok(r.subtitleKey in EN, `${r.subtitleKey} is not defined in English`);
    for (const tpl of [EN[r.titleKey], EN[r.subtitleKey]]) {
      for (const token of tpl.match(/\{(\w+)\}/g) ?? []) {
        const name = token.slice(1, -1);
        assert.ok(
          r.values && name in r.values,
          `${r.titleKey} needs {${name}}, and was given ${JSON.stringify(r.values)}`,
        );
      }
    }
  }
});

test("the weekend is the coming Friday to Sunday, and never yesterday", () => {
  // A Wednesday, a Friday, a Saturday and a Sunday: from each of them the
  // answer has to be a Friday that has not already gone.
  for (const today of ["2026-09-02", "2026-09-04", "2026-09-05", "2026-09-06"]) {
    const now = new Date(`${today}T12:00:00Z`);
    const { from, to } = weekendWindow(now);
    const start = new Date(`${from}T00:00:00Z`);
    assert.equal(start.getUTCDay(), 5, `${today} gave ${from}, which is not a Friday`);
    assert.ok(from >= today, `${today} was offered ${from}, which is in the past`);
    assert.equal(
      (new Date(`${to}T00:00:00Z`) - start) / 86_400_000, 2,
      "a weekend is two nights, Friday and Saturday",
    );
  }
});

test("next month is the whole of next month, and rolls over the year", () => {
  assert.deepEqual(nextMonthWindow(new Date("2026-09-15T00:00:00Z")),
    { from: "2026-10-01", to: "2026-11-01" });
  assert.deepEqual(nextMonthWindow(new Date("2026-12-31T00:00:00Z")),
    { from: "2027-01-01", to: "2027-02-01" });
  // Half-open, so the window ends where the following month begins and a stay
  // checking out on the 1st does not collide with one checking in that day.
  const { to } = nextMonthWindow(new Date("2026-01-10T00:00:00Z"));
  assert.equal(to, "2026-03-01");
});
