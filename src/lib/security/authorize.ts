/**
 * The authorisation engine.
 *
 * Everything the product allows or refuses is decided here, by a pure function
 * over an actor's grants. It touches no database and no request object, so the
 * rules can be read in one sitting and tested without a server.
 *
 * The rules, in order:
 *
 *   1. A suspended or merely-invited account decides nothing.
 *   2. A Paltas platform administrator may do anything, in any organisation.
 *      Read from the `isPlatformAdmin` column, never from a grant.
 *   3. The owner may do anything inside their own organisation. This is checked
 *      from the `isOwner` column, never from a grant, so no amount of permission
 *      editing can mint a second owner or strip the real one.
 *   4. An explicit DENY anywhere on the scope chain wins. That is what makes the
 *      owner's "❌ View financials" on one staff member hold even when a role
 *      they also carry would otherwise allow it.
 *   5. Otherwise an ALLOW anywhere on the chain grants it.
 *   6. Otherwise: refused. Nothing is permitted by omission.
 *
 * Inheritance runs downward only. A grant at PROPERTY scope covers every
 * building and unit beneath it; a grant at UNIT scope covers that unit alone and
 * confers nothing upward. The caller supplies the chain — the engine never
 * guesses at the shape of the tree.
 */

import { WILDCARD } from "./permissions";
import type { Actor, Decision, Grant, Scope, ScopeFilter, ScopeType } from "./types";

/** Broad → narrow. Used to compare how specific two grants are. */
const SCOPE_RANK: Record<ScopeType, number> = {
  ORGANIZATION: 0,
  PROPERTY: 1,
  BUILDING: 2,
  UNIT: 3,
};

/**
 * Does a stored grant pattern cover the permission being asked for?
 * `*` covers everything; `visitor.*` covers `visitor.checkin` but deliberately
 * not `visitors.checkin` — the dot is required, so prefixes cannot bleed.
 */
export function permissionMatches(pattern: string, requested: string): boolean {
  if (pattern === WILDCARD) return true;
  if (pattern === requested) return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return requested === prefix || requested.startsWith(prefix + ".");
  }
  return false;
}

/**
 * Build the chain of scopes a request touches, from the most specific node up to
 * the organisation. A unit-level action is authorised by a grant on the unit, its
 * building, its property, or the organisation — any one of them is enough.
 */
export function buildScopeChain(input: {
  orgId: string;
  propertyId?: string | null;
  buildingId?: string | null;
  unitId?: string | null;
}): Scope[] {
  const chain: Scope[] = [];
  if (input.unitId) chain.push({ type: "UNIT", id: input.unitId });
  if (input.buildingId) chain.push({ type: "BUILDING", id: input.buildingId });
  if (input.propertyId) chain.push({ type: "PROPERTY", id: input.propertyId });
  chain.push({ type: "ORGANIZATION", id: input.orgId });
  return chain;
}

function grantAppliesToChain(grant: Grant, chain: Scope[]): boolean {
  return chain.some((s) => s.type === grant.scopeType && s.id === grant.scopeId);
}

/**
 * The decision. `chain` must run from the narrowest scope touched to the
 * organisation; use `buildScopeChain` rather than assembling it by hand.
 */
export function decide(actor: Actor, permission: string, chain: Scope[]): Decision {
  if (actor.status !== "ACTIVE") {
    return { allowed: false, reason: `Account is ${actor.status.toLowerCase()}.` };
  }

  // Paltas staff operating the service. Checked before the organisation test,
  // because crossing organisations is exactly what this authority is for.
  if (actor.isPlatformAdmin) {
    return {
      allowed: true,
      reason: "Paltas platform administrator — access across all organisations.",
      matched: { permission: WILDCARD, effect: "ALLOW", scopeType: "ORGANIZATION", scopeId: chain.find((s) => s.type === "ORGANIZATION")?.id ?? "", source: "platform" },
    };
  }

  // The request must land inside the actor's own organisation. Without this,
  // a correctly-scoped grant in one organisation would be honoured against an
  // identically-shaped scope id in another.
  const org = chain.find((s) => s.type === "ORGANIZATION");
  if (!org || org.id !== actor.orgId) {
    return { allowed: false, reason: "Outside your organisation." };
  }

  if (actor.isOwner) {
    return {
      allowed: true,
      reason: "Property owner — full access to this organisation.",
      matched: { permission: WILDCARD, effect: "ALLOW", scopeType: "ORGANIZATION", scopeId: actor.orgId, source: "owner" },
    };
  }

  const applicable = actor.grants.filter(
    (g) => permissionMatches(g.permission, permission) && grantAppliesToChain(g, chain),
  );

  // Deny wins outright, regardless of how specific the competing allow is. An
  // owner who unticks a permission expects it gone, not out-ranked.
  const denied = applicable.find((g) => g.effect === "DENY");
  if (denied) {
    return {
      allowed: false,
      reason: `Explicitly denied at ${denied.scopeType.toLowerCase()} level.`,
      matched: denied,
    };
  }

  const allowed = applicable
    .filter((g) => g.effect === "ALLOW")
    // Report the most specific allow, which is the most useful one to show a user.
    .sort((a, b) => SCOPE_RANK[b.scopeType] - SCOPE_RANK[a.scopeType])[0];

  if (allowed) {
    return {
      allowed: true,
      reason: allowed.source === "role"
        ? `Granted by role "${allowed.roleName ?? "role"}".`
        : "Granted directly.",
      matched: allowed,
    };
  }

  return { allowed: false, reason: `Missing permission "${permission}" for this property.` };
}

/** Convenience wrapper when only the boolean matters. */
export function can(actor: Actor, permission: string, chain: Scope[]): boolean {
  return decide(actor, permission, chain).allowed;
}

/**
 * Does the actor hold this permission *anywhere*? Used for coarse questions —
 * "should the Security tab appear at all?" — never as a substitute for the
 * scoped check that the API performs before acting.
 */
export function canAnywhere(actor: Actor, permission: string): boolean {
  if (actor.status !== "ACTIVE") return false;
  if (actor.isPlatformAdmin) return true;
  if (actor.isOwner) return true;
  const applicable = actor.grants.filter((g) => permissionMatches(g.permission, permission));
  const allows = applicable.filter((g) => g.effect === "ALLOW");
  if (allows.length === 0) return false;
  // Only a blanket organisation-wide deny can rule it out everywhere.
  const blanketDeny = applicable.some((g) => g.effect === "DENY" && g.scopeType === "ORGANIZATION");
  return !blanketDeny;
}

/**
 * Turn an actor's grants into the set of scopes a list query may read.
 *
 * This is the data-isolation half of the model, and it is why a manager assigned
 * to Property A does not see Property B: the query is narrowed before it runs,
 * rather than the results being filtered after the fact.
 */
export function scopeFilterFor(actor: Actor, permission: string): ScopeFilter {
  if (actor.status !== "ACTIVE") return { kind: "none" };
  if (actor.isPlatformAdmin) return { kind: "platform" };
  if (actor.isOwner) return { kind: "all" };

  const applicable = actor.grants.filter((g) => permissionMatches(g.permission, permission));
  const allows = applicable.filter((g) => g.effect === "ALLOW");
  const denies = applicable.filter((g) => g.effect === "DENY");

  // A deny across the whole organisation removes the permission entirely.
  if (denies.some((g) => g.scopeType === "ORGANIZATION")) return { kind: "none" };
  // An allow across the whole organisation reaches every property in it, minus
  // any narrower scopes explicitly denied.
  if (allows.some((g) => g.scopeType === "ORGANIZATION")) {
    const denied = collect(denies);
    if (denied.propertyIds.length === 0 && denied.buildingIds.length === 0 && denied.unitIds.length === 0) {
      return { kind: "all" };
    }
    // An org-wide allow with carve-outs is expressed as "everything except".
    return {
      kind: "scoped",
      orgWide: true,
      propertyIds: [],
      buildingIds: [],
      unitIds: [],
      deniedPropertyIds: denied.propertyIds,
      deniedBuildingIds: denied.buildingIds,
      deniedUnitIds: denied.unitIds,
    };
  }

  if (allows.length === 0) return { kind: "none" };

  const granted = collect(allows);
  const denied = collect(denies);
  const notDenied = (ids: string[], deniedIds: string[]) => ids.filter((id) => !deniedIds.includes(id));

  return {
    kind: "scoped",
    orgWide: false,
    propertyIds: notDenied(granted.propertyIds, denied.propertyIds),
    buildingIds: notDenied(granted.buildingIds, denied.buildingIds),
    unitIds: notDenied(granted.unitIds, denied.unitIds),
    deniedPropertyIds: denied.propertyIds,
    deniedBuildingIds: denied.buildingIds,
    deniedUnitIds: denied.unitIds,
  };
}

function collect(grants: Grant[]) {
  const propertyIds: string[] = [];
  const buildingIds: string[] = [];
  const unitIds: string[] = [];
  for (const g of grants) {
    if (g.scopeType === "PROPERTY") propertyIds.push(g.scopeId);
    else if (g.scopeType === "BUILDING") buildingIds.push(g.scopeId);
    else if (g.scopeType === "UNIT") unitIds.push(g.scopeId);
  }
  return {
    propertyIds: Array.from(new Set(propertyIds)),
    buildingIds: Array.from(new Set(buildingIds)),
    unitIds: Array.from(new Set(unitIds)),
  };
}

/**
 * Flatten an actor into the plain permission keys the browser needs to decide
 * what to render. Wildcards are expanded against the catalogue so the client
 * never has to re-implement pattern matching.
 */
export function effectivePermissionKeys(actor: Actor, allPermissions: string[]): string[] {
  if (actor.isPlatformAdmin || actor.isOwner) return [...allPermissions];
  const out = new Set<string>();
  for (const key of allPermissions) {
    if (canAnywhere(actor, key)) out.add(key);
  }
  return Array.from(out);
}
