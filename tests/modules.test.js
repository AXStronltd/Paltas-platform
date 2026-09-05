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
