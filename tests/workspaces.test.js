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
