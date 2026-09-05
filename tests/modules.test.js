import test from "node:test";
import assert from "node:assert/strict";
import { MODULES, ALL_MODULES, moduleForPermission, moduleEntitles } from "../.test-build/lib/security/modules.js";
import { ALL_PERMISSIONS } from "../.test-build/lib/security/permissions.js";

test("every permission in the catalogue belongs to a module", () => {
  // The point of the whole file. A permission nobody has classified is a
  // permission no plan sells, and it would be found by a customer rather than
  // by us.
  const orphans = ALL_PERMISSIONS.filter((p) => moduleForPermission(p) === null);
  assert.deepEqual(orphans, [], `unclassified permissions: ${orphans.join(", ")}`);
});

test("no namespace is sold by two modules at once", () => {
  const seen = new Map();
  for (const [mod, namespaces] of Object.entries(MODULES)) {
    for (const ns of namespaces) {
      assert.equal(seen.has(ns), false, `"${ns}" is in both ${seen.get(ns)} and ${mod}`);
      seen.set(ns, mod);
    }
  }
});

test("core survives an empty subscription", () => {
  // A lapsed account must still reach its own properties and its own invoice.
  assert.equal(moduleEntitles([], "property.view"), true);
  assert.equal(moduleEntitles([], "staff.view"), true);
});

test("an unsold module is refused however complete the role", () => {
  assert.equal(moduleEntitles(["finance"], "visitor.approve"), false);
  assert.equal(moduleEntitles(["security"], "visitor.approve"), true);
});

test("an unclassified permission keeps working rather than vanishing", () => {
  // The safe direction: a namespace added tomorrow behaves as it does today
  // until somebody decides which plan sells it.
  assert.equal(moduleEntitles([], "somethingnew.view"), true);
});

test("every module is reachable by at least one real permission", () => {
  for (const mod of ALL_MODULES) {
    const hit = ALL_PERMISSIONS.some((p) => moduleForPermission(p) === mod);
    assert.equal(hit, true, `module "${mod}" sells nothing that exists`);
  }
});

/* composeModules — plan plus exceptions, the rule both callers share. */
import { composeModules } from "../.test-build/lib/security/modules.js";

const NOW = new Date("2026-09-06T00:00:00Z");

test("an active plan grants exactly its modules", () => {
  assert.deepEqual(
    composeModules({ status: "ACTIVE", modules: ["finance", "bookings"] }, [], NOW).sort(),
    ["bookings", "finance"],
  );
});

test("no subscription is unrestricted, not empty", () => {
  // A row missed on a new customer must not present them an empty product.
  const m = composeModules(null, [], NOW);
  assert.equal(m.includes("finance"), true);
  assert.equal(m.includes("security"), true);
});

test("past due keeps working; cancelled does not", () => {
  const plan = { modules: ["finance"] };
  assert.deepEqual(composeModules({ ...plan, status: "PAST_DUE" }, [], NOW), ["finance"]);
  assert.deepEqual(composeModules({ ...plan, status: "TRIALING" }, [], NOW), ["finance"]);
  assert.deepEqual(composeModules({ ...plan, status: "CANCELLED" }, [], NOW), []);
});

test("an exception adds a module the plan does not include", () => {
  const m = composeModules({ status: "ACTIVE", modules: ["bookings"] },
    [{ module: "finance", granted: true }], NOW);
  assert.equal(m.includes("finance"), true);
});

test("an exception withholds a module the plan does include", () => {
  const m = composeModules({ status: "ACTIVE", modules: ["bookings", "finance"] },
    [{ module: "finance", granted: false }], NOW);
  assert.equal(m.includes("finance"), false);
});

test("an expired exception is ignored in both directions", () => {
  const past = new Date("2026-01-01T00:00:00Z");
  const granted = composeModules({ status: "ACTIVE", modules: ["bookings"] },
    [{ module: "finance", granted: true, expiresAt: past }], NOW);
  assert.equal(granted.includes("finance"), false, "expired grant should lapse");

  const withheld = composeModules({ status: "ACTIVE", modules: ["finance"] },
    [{ module: "finance", granted: false, expiresAt: past }], NOW);
  assert.equal(withheld.includes("finance"), true, "expired withholding should lift");
});

test("an exception dated in the future still applies", () => {
  const later = new Date("2027-01-01T00:00:00Z");
  const m = composeModules({ status: "ACTIVE", modules: ["bookings"] },
    [{ module: "finance", granted: true, expiresAt: later }], NOW);
  assert.equal(m.includes("finance"), true);
});
