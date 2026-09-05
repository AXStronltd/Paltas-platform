import test from "node:test";
import assert from "node:assert/strict";
import { availableWorkspaces, landingFor } from "../.test-build/lib/auth/workspaces.js";

const PM = ["owner.dashboard.view", "property.view", "listing.view"];

test("a landlord holds their portal and the management console", () => {
  const w = availableWorkspaces({ dashboardRole: "landlord", permissions: PM });
  assert.deepEqual(w.map((x) => x.href), ["/portal/landlord", "/manage"]);
});

test("each business role gets its own portal, not somebody else's", () => {
  for (const role of ["developer", "landlord", "agent", "hotel", "seller"]) {
    const [first] = availableWorkspaces({ dashboardRole: role, permissions: PM });
    assert.equal(first.href, `/portal/${role}`);
  }
});

test("a tenant holds one workspace and is not offered a portal", () => {
  const w = availableWorkspaces({ dashboardRole: "resident", permissions: ["maintenance.view"] });
  assert.deepEqual(w.map((x) => x.href), []);
});

test("an account with no management permission is not offered an empty console", () => {
  const w = availableWorkspaces({ dashboardRole: "landlord", permissions: [] });
  assert.deepEqual(w.map((x) => x.href), ["/portal/landlord"]);
});

test("platform staff get the console without needing a portal role", () => {
  const w = availableWorkspaces({ dashboardRole: null, isPlatformAdmin: true });
  assert.deepEqual(w.map((x) => x.href), ["/manage"]);
});

test("one workspace skips the chooser entirely", () => {
  assert.equal(landingFor({ dashboardRole: "landlord", permissions: [] }), "/portal/landlord");
  assert.equal(landingFor({ isPlatformAdmin: true }), "/manage");
});

test("two or more workspaces means the person chooses", () => {
  assert.equal(landingFor({ dashboardRole: "agent", permissions: PM }), "/workspace");
});

test("no workspace at all still lands somewhere real", () => {
  assert.equal(landingFor({}), "/manage");
});

test("an unknown role is not turned into a portal that does not exist", () => {
  const w = availableWorkspaces({ dashboardRole: "wizard", permissions: PM });
  assert.deepEqual(w.map((x) => x.href), ["/manage"]);
});

test("every workspace carries message keys, never English", () => {
  for (const w of availableWorkspaces({ dashboardRole: "hotel", permissions: PM })) {
    assert.match(w.labelKey, /^ws\./);
    assert.match(w.descriptionKey, /^ws\./);
  }
});

/* Organisations — the case where the account, not the area, is being chosen. */

const TWO_ORGS = [
  { id: "org_a", name: "Coastal Living" },
  { id: "org_b", name: "Nairobi Estates" },
];

test("one organisation is not offered as a choice", () => {
  // The ordinary account. Every user was backfilled with exactly one
  // membership, so offering it would show everybody a picker containing only
  // their own company.
  const w = availableWorkspaces({
    dashboardRole: "landlord",
    organizations: [TWO_ORGS[0]],
    activeOrgId: "org_a",
  });
  assert.equal(w.filter((x) => x.key.startsWith("org:")).length, 0);
});

test("a second organisation appears, and the active one does not", () => {
  const w = availableWorkspaces({
    dashboardRole: "landlord",
    organizations: TWO_ORGS,
    activeOrgId: "org_a",
  });
  const orgs = w.filter((x) => x.key.startsWith("org:"));
  assert.deepEqual(orgs.map((o) => o.name), ["Nairobi Estates"]);
});

test("an organisation is named by its own name, not a translation key", () => {
  const [org] = availableWorkspaces({
    organizations: TWO_ORGS,
    activeOrgId: "org_a",
  }).filter((x) => x.key.startsWith("org:"));
  assert.equal(org.name, "Nairobi Estates");
});

test("organisation ids are escaped into the switch link", () => {
  const [org] = availableWorkspaces({
    organizations: [{ id: "org_a", name: "A" }, { id: "a b&c", name: "B" }],
    activeOrgId: "org_a",
  }).filter((x) => x.key.startsWith("org:"));
  assert.equal(org.href, "/workspace/switch?org=a%20b%26c");
});

test("belonging to two organisations is itself a reason to choose", () => {
  // A landlord in two companies with no management permissions still has a
  // decision to make, and must not be sent silently into one of them.
  assert.equal(
    landingFor({ dashboardRole: "landlord", organizations: TWO_ORGS, activeOrgId: "org_a" }),
    "/workspace",
  );
});
