import test from "node:test";
import assert from "node:assert/strict";
import {
  distanceKm, nearest, popular, withinViewport, remember, parseRecent, radiusForPlace, RECENT_LIMIT,
} from "../.test-build/lib/search/destinations.js";

const NAIROBI = { city: "Nairobi", country: "KE", latitude: -1.2921, longitude: 36.8219, listings: 12 };
const MOMBASA = { city: "Mombasa", country: "KE", latitude: -4.0435, longitude: 39.6682, listings: 5 };
const DIANI = { city: "Diani", country: "KE", latitude: -4.2769, longitude: 39.5906, listings: 9 };
const DUBAI = { city: "Dubai", country: "AE", latitude: 25.2048, longitude: 55.2708, listings: 20 };
const ALL = [NAIROBI, MOMBASA, DIANI, DUBAI];

test("distance between two known cities is right to within a percent", () => {
  // Nairobi to Mombasa is about 440 km as the crow flies.
  const d = distanceKm(NAIROBI, MOMBASA);
  assert.ok(d > 430 && d < 450, `expected ~440 km, got ${d}`);
});

test("distance to oneself is nothing", () => {
  assert.equal(Math.round(distanceKm(NAIROBI, NAIROBI)), 0);
});

test("distance is symmetric", () => {
  assert.ok(Math.abs(distanceKm(NAIROBI, DUBAI) - distanceKm(DUBAI, NAIROBI)) < 0.001);
});

test("nearest returns closest first", () => {
  const near = nearest({ latitude: -4.05, longitude: 39.66 }, ALL, { withinKm: 1000 });
  assert.equal(near[0].city, "Mombasa");
  assert.equal(near[1].city, "Diani");
});

test("nearest excludes what is beyond the radius", () => {
  const near = nearest(NAIROBI, ALL, { withinKm: 100 });
  assert.deepEqual(near.map((d) => d.city), ["Nairobi"]);
});

test("a visitor far from everything gets an empty list rather than a wrong one", () => {
  assert.deepEqual(nearest({ latitude: 64.1, longitude: -21.9 }, ALL, { withinKm: 400 }), []);
});

test("nearest carries the distance it sorted by", () => {
  const [first] = nearest(MOMBASA, ALL, { withinKm: 1000 });
  assert.ok(typeof first.distanceKm === "number");
});

test("popular ranks by inventory, not alphabet", () => {
  assert.deepEqual(popular(ALL).map((d) => d.city), ["Dubai", "Nairobi", "Diani", "Mombasa"]);
});

test("a destination with nothing in it is never suggested", () => {
  const empty = { city: "Kisumu", country: "KE", latitude: -0.09, longitude: 34.76, listings: 0 };
  assert.ok(!popular([...ALL, empty]).some((d) => d.city === "Kisumu"));
});

test("ties break stably rather than by row order", () => {
  const a = { city: "Zanzibar", country: "TZ", latitude: -6.16, longitude: 39.19, listings: 5 };
  const first = popular([MOMBASA, a]).map((d) => d.city);
  const second = popular([a, MOMBASA]).map((d) => d.city);
  assert.deepEqual(first, second);
});

test("viewport keeps what is inside it", () => {
  const inside = withinViewport(ALL, { north: 0, south: -5, east: 40, west: 36 });
  assert.deepEqual(inside.map((d) => d.city).sort(), ["Diani", "Mombasa", "Nairobi"]);
});

test("a viewport across the antimeridian does not exclude everything", () => {
  const fiji = { city: "Suva", country: "FJ", latitude: -18.1, longitude: 178.4, listings: 3 };
  const samoa = { city: "Apia", country: "WS", latitude: -13.8, longitude: -171.7, listings: 2 };
  const seen = withinViewport([fiji, samoa], { north: -5, south: -25, east: -170, west: 170 });
  assert.deepEqual(seen.map((d) => d.city).sort(), ["Apia", "Suva"]);
});

test("a repeated search leaves one entry, at the top", () => {
  let list = [];
  list = remember(list, { placeId: "a", label: "Nairobi", at: 1 });
  list = remember(list, { placeId: "b", label: "Diani", at: 2 });
  list = remember(list, { placeId: "a", label: "Nairobi", at: 3 });
  assert.deepEqual(list.map((e) => e.label), ["Nairobi", "Diani"]);
  assert.equal(list[0].at, 3);
});

test("a typed search with no place id dedupes on its label, case-insensitively", () => {
  let list = remember([], { label: "diani", at: 1 });
  list = remember(list, { label: "  Diani ", at: 2 });
  assert.equal(list.length, 1);
});

test("recent searches are capped", () => {
  let list = [];
  for (let i = 0; i < RECENT_LIMIT + 5; i++) list = remember(list, { label: `City ${i}`, at: i });
  assert.equal(list.length, RECENT_LIMIT);
  assert.equal(list[0].label, `City ${RECENT_LIMIT + 4}`);
});

test("junk in storage is discarded rather than trusted", () => {
  assert.deepEqual(parseRecent(null), []);
  assert.deepEqual(parseRecent("not json"), []);
  assert.deepEqual(parseRecent('{"not":"an array"}'), []);
  assert.deepEqual(parseRecent('[{"label":"ok","at":1},{"bad":true},"string"]'), [{ label: "ok", at: 1 }]);
});

test("radius follows what kind of place was chosen", () => {
  assert.ok(radiusForPlace(["country"]) > radiusForPlace(["locality"]));
  assert.ok(radiusForPlace(["locality"]) > radiusForPlace(["neighborhood"]));
  assert.ok(radiusForPlace(["neighborhood"]) > radiusForPlace(["street_address"]));
});

test("an unknown place type gets a workable default rather than nothing", () => {
  assert.ok(radiusForPlace(undefined) > 0);
  assert.ok(radiusForPlace([]) > 0);
});
