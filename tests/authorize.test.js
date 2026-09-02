/**
 * The authorisation engine, under test.
 *
 * These are the rules the whole product rests on, so they are checked directly
 * rather than inferred from the behaviour of an endpoint: deny beats allow,
 * grants inherit downward and never upward, the owner is absolute inside their
 * own organisation and powerless outside it, and nothing at all is permitted by
 * omission. The worked example from the brief — John the guard, with residents
 * and incidents added and finance taken away — is here as a test too.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { decide, can, canAnywhere, scopeFilterFor, buildScopeChain, permissionMatches, effectivePermissionKeys } = require("../.test-build/lib/security/authorize.js");
const { PERMISSIONS, ALL_PERMISSIONS } = require("../.test-build/lib/security/permissions.js");
const { SYSTEM_ROLES } = require("../.test-build/lib/security/roles.js");

const ORG = "org_1";
const PROP_A = "prop_a";
const PROP_B = "prop_b";
const BLD_A1 = "bld_a1";
const UNIT_A204 = "unit_a204";

const chainOrg = buildScopeChain({ orgId: ORG });
const chainPropA = buildScopeChain({ orgId: ORG, propertyId: PROP_A });
const chainPropB = buildScopeChain({ orgId: ORG, propertyId: PROP_B });
const chainUnit = buildScopeChain({ orgId: ORG, propertyId: PROP_A, buildingId: BLD_A1, unitId: UNIT_A204 });

const actor = (over = {}) => ({
  id: "u1", orgId: ORG, name: "Test", email: "t@x.co",
  isOwner: false, isPlatformAdmin: false, status: "ACTIVE", roles: [], grants: [], ...over,
});
const grant = (permission, scopeType, scopeId, effect = "ALLOW", source = "direct") =>
  ({ permission, effect, scopeType, scopeId, source });

// Build an actor holding a system role at a scope, the way loadActor does.
function withRole(roleKey, scopeType, scopeId, extra = []) {
  const role = SYSTEM_ROLES.find((r) => r.key === roleKey);
  const grants = role.permissions.map((p) => ({
    permission: p, effect: "ALLOW", scopeType, scopeId, source: "role", roleName: role.name,
  }));
  return actor({ grants: [...grants, ...extra], roles: [{ key: roleKey, name: role.name, scopeType, scopeId }] });
}

test("pattern matching: exact, wildcard, and no prefix bleed", () => {
  assert.equal(permissionMatches("visitor.create", "visitor.create"), true);
  assert.equal(permissionMatches("*", "anything.at.all"), true);
  assert.equal(permissionMatches("visitor.*", "visitor.checkin"), true);
  assert.equal(permissionMatches("visitor.*", "visitor"), true);
  assert.equal(permissionMatches("security.*", "security.incident.create"), true);
  // The dot is required, so "visitor.*" must not swallow a different noun.
  assert.equal(permissionMatches("visitor.*", "visitors.checkin"), false);
  assert.equal(permissionMatches("card.suspend", "card.revoke"), false);
});

test("owner may do anything inside their own organisation", () => {
  const owner = actor({ isOwner: true });
  for (const p of ALL_PERMISSIONS) {
    assert.equal(decide(owner, p, chainUnit).allowed, true, `owner denied ${p}`);
  }
  assert.equal(decide(owner, PERMISSIONS.PROPERTY_DELETE, chainPropB).allowed, true);
});

test("owner authority does not cross organisations", () => {
  const owner = actor({ isOwner: true });
  const otherOrgChain = buildScopeChain({ orgId: "org_2", propertyId: PROP_A });
  const d = decide(owner, PERMISSIONS.VISITOR_VIEW, otherOrgChain);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /Outside your organisation/);
});

test("nothing is permitted by omission", () => {
  const nobody = actor();
  assert.equal(decide(nobody, PERMISSIONS.VISITOR_VIEW, chainPropA).allowed, false);
  assert.equal(decide(nobody, PERMISSIONS.FINANCE_VIEW, chainOrg).allowed, false);
});

test("a suspended account decides nothing", () => {
  const suspended = actor({ status: "SUSPENDED", grants: [grant("*", "ORGANIZATION", ORG)] });
  assert.equal(decide(suspended, PERMISSIONS.VISITOR_VIEW, chainPropA).allowed, false);
  assert.equal(canAnywhere(suspended, PERMISSIONS.VISITOR_VIEW), false);
  assert.equal(scopeFilterFor(suspended).kind, "none");
});

test("grants inherit downward, never upward", () => {
  const atProperty = actor({ grants: [grant(PERMISSIONS.UNIT_VIEW, "PROPERTY", PROP_A)] });
  // Property-level grant reaches the unit beneath it.
  assert.equal(can(atProperty, PERMISSIONS.UNIT_VIEW, chainUnit), true);

  const atUnit = actor({ grants: [grant(PERMISSIONS.UNIT_VIEW, "UNIT", UNIT_A204)] });
  // Unit-level grant does NOT reach the property above it.
  assert.equal(can(atUnit, PERMISSIONS.UNIT_VIEW, chainPropA), false);
  assert.equal(can(atUnit, PERMISSIONS.UNIT_VIEW, chainUnit), true);
});

test("data isolation: a grant at Property A says nothing about Property B", () => {
  const managerA = withRole("property_manager", "PROPERTY", PROP_A);
  assert.equal(can(managerA, PERMISSIONS.UNIT_VIEW, chainPropA), true);
  assert.equal(can(managerA, PERMISSIONS.UNIT_VIEW, chainPropB), false);
  assert.equal(can(managerA, PERMISSIONS.RESIDENT_VIEW, chainPropB), false);

  const filter = scopeFilterFor(managerA, PERMISSIONS.UNIT_VIEW);
  assert.equal(filter.kind, "scoped");
  assert.deepEqual(filter.propertyIds, [PROP_A]);
  assert.equal(filter.propertyIds.includes(PROP_B), false);
});

test("deny beats allow, however specific the allow", () => {
  const john = actor({
    grants: [
      grant(PERMISSIONS.FINANCE_VIEW, "ORGANIZATION", ORG),        // broad allow
      grant(PERMISSIONS.FINANCE_VIEW, "PROPERTY", PROP_A, "DENY"), // narrow deny
    ],
  });
  assert.equal(can(john, PERMISSIONS.FINANCE_VIEW, chainPropA), false);

  const reversed = actor({
    grants: [
      grant(PERMISSIONS.FINANCE_VIEW, "UNIT", UNIT_A204),            // narrow allow
      grant(PERMISSIONS.FINANCE_VIEW, "ORGANIZATION", ORG, "DENY"),  // broad deny
    ],
  });
  assert.equal(can(reversed, PERMISSIONS.FINANCE_VIEW, chainUnit), false);
});

test("a deny carves a hole in a wildcard role grant", () => {
  const manager = withRole("security_manager", "PROPERTY", PROP_A, [
    grant(PERMISSIONS.SECURITY_INCIDENT_RESOLVE, "PROPERTY", PROP_A, "DENY"),
  ]);
  // "security.*" from the role covers it...
  assert.equal(can(manager, PERMISSIONS.SECURITY_INCIDENT_VIEW, chainPropA), true);
  // ...but the explicit deny still wins for the one permission.
  assert.equal(can(manager, PERMISSIONS.SECURITY_INCIDENT_RESOLVE, chainPropA), false);
});

test("the brief's worked example: John the guard", () => {
  const john = withRole("security_guard", "PROPERTY", PROP_A, [
    grant(PERMISSIONS.RESIDENT_VIEW, "PROPERTY", PROP_A),
    grant(PERMISSIONS.FINANCE_VIEW, "PROPERTY", PROP_A, "DENY"),
    grant(PERMISSIONS.STAFF_CREATE, "PROPERTY", PROP_A, "DENY"),
    grant(PERMISSIONS.PROPERTY_DELETE, "PROPERTY", PROP_A, "DENY"),
    grant(PERMISSIONS.OWNER_INFO_VIEW, "PROPERTY", PROP_A, "DENY"),
  ]);
  // ✅ View residents, manage visitors, view security incidents
  assert.equal(can(john, PERMISSIONS.RESIDENT_VIEW, chainPropA), true);
  assert.equal(can(john, PERMISSIONS.VISITOR_CHECKIN, chainPropA), true);
  assert.equal(can(john, PERMISSIONS.VISITOR_CHECKOUT, chainPropA), true);
  assert.equal(can(john, PERMISSIONS.PASS_VERIFY, chainPropA), true);
  assert.equal(can(john, PERMISSIONS.SECURITY_INCIDENT_VIEW, chainPropA), true);
  // ❌ Financials, staff management, deleting properties, owner information
  assert.equal(can(john, PERMISSIONS.FINANCE_VIEW, chainPropA), false);
  assert.equal(can(john, PERMISSIONS.STAFF_CREATE, chainPropA), false);
  assert.equal(can(john, PERMISSIONS.PROPERTY_DELETE, chainPropA), false);
  assert.equal(can(john, PERMISSIONS.OWNER_INFO_VIEW, chainPropA), false);
  assert.equal(can(john, PERMISSIONS.STAFF_PERMISSIONS_MANAGE, chainPropA), false);
});

test("role boundaries hold: a guard sees no money and no contracts", () => {
  const guard = withRole("security_guard", "PROPERTY", PROP_A);
  for (const p of [
    PERMISSIONS.FINANCE_VIEW, PERMISSIONS.FINANCE_PAYMENT_VIEW, PERMISSIONS.FINANCE_REPORT_VIEW,
    PERMISSIONS.RESIDENT_CONTACT_VIEW, PERMISSIONS.STAFF_CREATE, PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.OWNER_DASHBOARD_VIEW, PERMISSIONS.PROPERTY_DELETE, PERMISSIONS.CARD_REVOKE,
  ]) {
    assert.equal(can(guard, p, chainPropA), false, `guard should not hold ${p}`);
  }
});

test("role boundaries hold: an accountant touches no security administration", () => {
  const acct = withRole("accountant", "ORGANIZATION", ORG);
  assert.equal(can(acct, PERMISSIONS.FINANCE_PAYMENT_VIEW, chainPropA), true);
  for (const p of [
    PERMISSIONS.VISITOR_CHECKIN, PERMISSIONS.CARD_SUSPEND, PERMISSIONS.GUARD_MANAGE,
    PERMISSIONS.SECURITY_INCIDENT_CREATE, PERMISSIONS.RESIDENT_CONTACT_VIEW, PERMISSIONS.STAFF_CREATE,
  ]) {
    assert.equal(can(acct, p, chainPropA), false, `accountant should not hold ${p}`);
  }
});

test("role boundaries hold: maintenance sees no finance or security admin", () => {
  const maint = withRole("maintenance_staff", "PROPERTY", PROP_A);
  assert.equal(can(maint, PERMISSIONS.MAINTENANCE_RESOLVE, chainPropA), true);
  for (const p of [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.CARD_SUSPEND, PERMISSIONS.GUARD_MANAGE, PERMISSIONS.VISITOR_CHECKIN]) {
    assert.equal(can(maint, p, chainPropA), false, `maintenance should not hold ${p}`);
  }
});

test("property manager gets limited finance: read, not write", () => {
  const pm = withRole("property_manager", "PROPERTY", PROP_A);
  assert.equal(can(pm, PERMISSIONS.FINANCE_VIEW, chainPropA), true);
  assert.equal(can(pm, PERMISSIONS.FINANCE_PAYMENT_VIEW, chainPropA), true);
  assert.equal(can(pm, PERMISSIONS.FINANCE_PAYMENT_RECORD, chainPropA), false);
  assert.equal(can(pm, PERMISSIONS.FINANCE_EXPENSE_CREATE, chainPropA), false);
  assert.equal(can(pm, PERMISSIONS.PROPERTY_DELETE, chainPropA), false);
});

test("scopeFilterFor: organisation-wide allow with a carve-out", () => {
  const a = actor({
    grants: [
      grant(PERMISSIONS.UNIT_VIEW, "ORGANIZATION", ORG),
      grant(PERMISSIONS.UNIT_VIEW, "PROPERTY", PROP_B, "DENY"),
    ],
  });
  const f = scopeFilterFor(a, PERMISSIONS.UNIT_VIEW);
  assert.equal(f.kind, "scoped");
  assert.equal(f.orgWide, true);
  assert.deepEqual(f.deniedPropertyIds, [PROP_B]);
  assert.equal(can(a, PERMISSIONS.UNIT_VIEW, chainPropA), true);
  assert.equal(can(a, PERMISSIONS.UNIT_VIEW, chainPropB), false);
});

test("scopeFilterFor: owner sees all, unpermitted sees none", () => {
  assert.deepEqual(scopeFilterFor(actor({ isOwner: true }), PERMISSIONS.UNIT_VIEW), { kind: "all" });
  assert.equal(scopeFilterFor(actor(), PERMISSIONS.UNIT_VIEW).kind, "none");
  const orgDeny = actor({ grants: [grant(PERMISSIONS.UNIT_VIEW, "ORGANIZATION", ORG, "DENY")] });
  assert.equal(scopeFilterFor(orgDeny, PERMISSIONS.UNIT_VIEW).kind, "none");
});

test("canAnywhere is coarse but never overrides a blanket deny", () => {
  const a = actor({ grants: [grant(PERMISSIONS.FINANCE_VIEW, "PROPERTY", PROP_A)] });
  assert.equal(canAnywhere(a, PERMISSIONS.FINANCE_VIEW), true);
  const b = actor({
    grants: [
      grant(PERMISSIONS.FINANCE_VIEW, "PROPERTY", PROP_A),
      grant(PERMISSIONS.FINANCE_VIEW, "ORGANIZATION", ORG, "DENY"),
    ],
  });
  assert.equal(canAnywhere(b, PERMISSIONS.FINANCE_VIEW), false);
});

test("effective permission keys match per-scope decisions for the owner", () => {
  const owner = actor({ isOwner: true });
  assert.equal(effectivePermissionKeys(owner, ALL_PERMISSIONS).length, ALL_PERMISSIONS.length);
});

test("the decision explains itself", () => {
  const pm = withRole("property_manager", "PROPERTY", PROP_A);
  const yes = decide(pm, PERMISSIONS.UNIT_VIEW, chainPropA);
  assert.equal(yes.allowed, true);
  assert.match(yes.reason, /Property Manager/);
  const no = decide(pm, PERMISSIONS.PROPERTY_DELETE, chainPropA);
  assert.match(no.reason, /Missing permission "property.delete"/);
});

test("every system role names only real permissions", () => {
  const known = new Set(ALL_PERMISSIONS);
  for (const role of SYSTEM_ROLES) {
    for (const p of role.permissions) {
      if (p === "*" || p.endsWith(".*")) continue;
      assert.equal(known.has(p), true, `${role.key} names unknown permission ${p}`);
    }
  }
});

test("platform administrator crosses organisations; the owner does not", () => {
  const platform = actor({ isPlatformAdmin: true, orgId: "org_platform" });
  const otherOrg = buildScopeChain({ orgId: "org_2", propertyId: "prop_x", unitId: "unit_x" });

  // Reaches into an organisation that is not their own — the whole point.
  assert.equal(can(platform, PERMISSIONS.PROPERTY_DELETE, otherOrg), true);
  assert.equal(can(platform, PERMISSIONS.FINANCE_VIEW, chainPropA), true);
  assert.equal(scopeFilterFor(platform, PERMISSIONS.UNIT_VIEW).kind, "platform");

  // An owner, by contrast, is absolute at home and powerless abroad.
  const owner = actor({ isOwner: true });
  assert.equal(can(owner, PERMISSIONS.PROPERTY_VIEW, chainPropA), true);
  assert.equal(can(owner, PERMISSIONS.PROPERTY_VIEW, otherOrg), false);
});

test("platform authority still respects account status", () => {
  const suspended = actor({ isPlatformAdmin: true, status: "SUSPENDED" });
  assert.equal(can(suspended, PERMISSIONS.PROPERTY_VIEW, chainPropA), false);
  assert.equal(canAnywhere(suspended, PERMISSIONS.PROPERTY_VIEW), false);
  assert.equal(scopeFilterFor(suspended, PERMISSIONS.PROPERTY_VIEW).kind, "none");
});

test("platform authority cannot be forged by a grant", () => {
  // A tenant handing themselves every permission in their own organisation is
  // still confined to it — only the isPlatformAdmin column crosses the line.
  const wannabe = actor({ grants: [grant("*", "ORGANIZATION", ORG)] });
  assert.equal(can(wannabe, PERMISSIONS.PROPERTY_DELETE, chainPropA), true);
  assert.equal(can(wannabe, PERMISSIONS.PROPERTY_VIEW, buildScopeChain({ orgId: "org_2", propertyId: "p" })), false);
});

test("sensitive permissions are named by roles, never absorbed by a wildcard", () => {
  // A wildcard silently gains every permission later added under its prefix.
  // That is how a role quietly acquires authority nobody decided to give it —
  // it happened here the moment `finance.charge.waive` was introduced under an
  // accountant already holding `finance.*`. This pins the blast radius: any role
  // reaching a sensitive permission must name it, so widening shows up as a diff.
  const sensitive = new Set(
    require("../.test-build/lib/security/permissions.js").PERMISSION_GROUPS
      .flatMap((g) => g.permissions)
      .filter((p) => p.sensitive)
      .map((p) => p.key),
  );

  const offences = [];
  for (const role of SYSTEM_ROLES) {
    const wildcards = role.permissions.filter((p) => p.endsWith(".*"));
    for (const pattern of wildcards) {
      const prefix = pattern.slice(0, -2);
      for (const key of sensitive) {
        if (!key.startsWith(prefix + ".")) continue;
        if (role.permissions.includes(key)) continue; // named explicitly — fine
        offences.push(`${role.key} reaches sensitive "${key}" only via "${pattern}"`);
      }
    }
  }
  assert.deepEqual(offences, [], offences.join("\n"));
});

test("the accountant's authority is fully enumerated", () => {
  // A characterisation test: if this list changes, someone changed what the
  // finance role can do, and that should be a deliberate, reviewed edit.
  const acct = SYSTEM_ROLES.find((r) => r.key === "accountant");
  assert.equal(acct.permissions.filter((p) => p.includes("*")).length, 0,
    "the finance role holds no wildcards");
  for (const p of ["finance.charge.waive", "payroll.approve", "finance.category.manage"]) {
    assert.ok(acct.permissions.includes(p), `${p} must be granted deliberately`);
  }
  for (const p of ["visitor.checkin", "card.suspend", "staff.create", "property.delete", "loyalty.adjust"]) {
    assert.ok(!acct.permissions.includes(p), `the finance role must not hold ${p}`);
  }
});
