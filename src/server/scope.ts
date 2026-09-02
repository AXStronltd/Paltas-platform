import { prisma } from "./db";
import { buildScopeChain } from "@/lib/security/authorize";
import type { Scope, ScopeFilter } from "@/lib/security/types";

/**
 * Turning a request into a scope chain, and a scope filter into a database
 * query. This is the only place that knows the portfolio's tree shape.
 */

export interface ScopeInput {
  propertyId?: string | null;
  buildingId?: string | null;
  unitId?: string | null;
}

export interface ResolvedScope {
  chain: Scope[];
  orgId: string;
  propertyId: string | null;
  buildingId: string | null;
  unitId: string | null;
}

/**
 * Fill in the ancestors of whatever the request named. A handler that receives
 * only a `unitId` still gets authorised against the unit's building, property
 * and organisation, so a manager holding a property-wide grant is not refused
 * for lack of a unit-level one.
 *
 * `orgId` of `null` means "do not restrict by organisation" — used only for
 * Paltas platform staff, whose whole purpose is to cross them. For everyone else
 * an id belonging to another organisation resolves to null, and callers answer
 * that the same way they answer a genuinely missing id, so probing for the
 * existence of another tenant's records tells you nothing.
 */
export async function resolveScope(
  orgId: string | null,
  input: ScopeInput,
): Promise<ResolvedScope | null> {
  let propertyId = input.propertyId ?? null;
  let buildingId = input.buildingId ?? null;
  const unitId = input.unitId ?? null;
  let ownerOrgId = orgId;

  if (unitId) {
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: { buildingId: true, propertyId: true, property: { select: { orgId: true } } },
    });
    if (!unit) return null;
    if (orgId !== null && unit.property.orgId !== orgId) return null;
    buildingId = unit.buildingId;
    propertyId = unit.propertyId;
    ownerOrgId = unit.property.orgId;
  } else if (buildingId) {
    const building = await prisma.building.findUnique({
      where: { id: buildingId },
      select: { propertyId: true, property: { select: { orgId: true } } },
    });
    if (!building) return null;
    if (orgId !== null && building.property.orgId !== orgId) return null;
    propertyId = building.propertyId;
    ownerOrgId = building.property.orgId;
  } else if (propertyId) {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { orgId: true },
    });
    if (!property) return null;
    if (orgId !== null && property.orgId !== orgId) return null;
    ownerOrgId = property.orgId;
  }

  // A platform administrator naming nothing at all has no organisation to
  // anchor to; the chain is then organisation-less and only they can pass it.
  if (ownerOrgId === null) ownerOrgId = "";

  return {
    chain: buildScopeChain({ orgId: ownerOrgId, propertyId, buildingId, unitId }),
    orgId: ownerOrgId,
    propertyId,
    buildingId,
    unitId,
  };
}

/**
 * From an abstract scope filter to concrete ids.
 *
 * The engine reasons in terms of grants; the database needs id lists. This
 * resolves one into the other once per request, expanding an organisation-wide
 * grant into the properties it actually covers and subtracting anything the
 * owner explicitly denied.
 */
export type Access =
  /** Every organisation. Paltas platform staff only. */
  | { kind: "platform" }
  /** Everything inside one organisation. */
  | { kind: "all"; orgId: string }
  | { kind: "none" }
  | {
      kind: "scoped";
      orgId: string;
      /** Properties the actor may see in full. */
      propertyIds: string[];
      /** Buildings granted on their own, inside properties not granted in full. */
      buildingIds: string[];
      /** Units granted on their own, inside buildings not granted in full. */
      unitIds: string[];
    };

export async function resolveAccess(orgId: string, filter: ScopeFilter): Promise<Access> {
  if (filter.kind === "platform") return { kind: "platform" };
  if (filter.kind === "all") return { kind: "all", orgId };
  if (filter.kind === "none") return { kind: "none" };

  if (filter.orgWide) {
    if (filter.deniedPropertyIds.length === 0) return { kind: "all", orgId };
    const rows = await prisma.property.findMany({
      where: { orgId, id: { notIn: filter.deniedPropertyIds } },
      select: { id: true },
    });
    return { kind: "scoped", orgId, propertyIds: rows.map((r) => r.id), buildingIds: [], unitIds: [] };
  }

  const propertyIds = filter.propertyIds;
  const buildingIds = filter.buildingIds.filter((id) => !filter.deniedBuildingIds.includes(id));
  const unitIds = filter.unitIds.filter((id) => !filter.deniedUnitIds.includes(id));

  if (propertyIds.length === 0 && buildingIds.length === 0 && unitIds.length === 0) {
    return { kind: "none" };
  }
  return { kind: "scoped", orgId, propertyIds, buildingIds, unitIds };
}

/** Nothing matches this, and it costs one trivially-indexed query to say so. */
export const MATCH_NOTHING = { id: { in: [] as string[] } };

/**
 * Every builder below returns a concrete `where` fragment rather than `null`.
 *
 * That is deliberate: an earlier version returned `null` for "no restriction"
 * and left each route to supply its own organisation fallback, which meant the
 * same clause was written out twenty-five times and had to be right every time.
 * It also broke the moment an actor's reach crossed organisations. The scope
 * object now carries enough to answer completely, and routes just spread it.
 */

/**
 * For tables keyed only by property — visitors, gates, guards, expenses. A grant
 * on a single building or unit deliberately does *not* open the property-wide
 * list: someone assigned one block should not read the whole estate's visitor
 * book.
 */
export function whereByProperty(access: Access): Record<string, unknown> {
  if (access.kind === "platform") return {};
  if (access.kind === "all") return { property: { orgId: access.orgId } };
  if (access.kind === "none") return MATCH_NOTHING;
  if (access.propertyIds.length === 0) return MATCH_NOTHING;
  return { propertyId: { in: access.propertyIds } };
}

/**
 * For tables that also carry `unitId` and/or `buildingId` — invitations, visits,
 * cards, vehicles, incidents, payments. Here a building- or unit-level grant does
 * reach the rows beneath it, which is the whole point of scoping someone to a
 * single block.
 */
export function whereByPropertyOrUnit(
  access: Access,
  opts: { building?: boolean } = {},
): Record<string, unknown> {
  if (access.kind === "platform") return {};
  if (access.kind === "all") return { property: { orgId: access.orgId } };
  if (access.kind === "none") return MATCH_NOTHING;

  const or: Record<string, unknown>[] = [];
  if (access.propertyIds.length) or.push({ propertyId: { in: access.propertyIds } });
  if (opts.building && access.buildingIds.length) or.push({ buildingId: { in: access.buildingIds } });
  if (access.unitIds.length) or.push({ unitId: { in: access.unitIds } });

  if (or.length === 0) return MATCH_NOTHING;
  return or.length === 1 ? or[0] : { OR: or };
}

/**
 * The Unit table itself. Distinct from `whereByPropertyOrUnit` because a unit's
 * own identifier is `id`, not `unitId` — pointing the generic helper at the Unit
 * table produces an invalid query rather than a wrong answer, which is exactly
 * the bug this function exists to have fixed.
 */
export function whereForUnitTable(access: Access): Record<string, unknown> {
  if (access.kind === "platform") return {};
  if (access.kind === "all") return { property: { orgId: access.orgId } };
  if (access.kind === "none") return MATCH_NOTHING;

  const or: Record<string, unknown>[] = [];
  if (access.propertyIds.length) or.push({ propertyId: { in: access.propertyIds } });
  if (access.buildingIds.length) or.push({ buildingId: { in: access.buildingIds } });
  if (access.unitIds.length) or.push({ id: { in: access.unitIds } });

  if (or.length === 0) return MATCH_NOTHING;
  return or.length === 1 ? or[0] : { OR: or };
}

/**
 * The Building table. A building-scoped grant must surface the building it
 * names; a unit-scoped grant surfaces the building containing it, so the
 * drill-down has a rung to stand on.
 */
export function whereForBuildingTable(access: Access): Record<string, unknown> {
  if (access.kind === "platform") return {};
  if (access.kind === "all") return { property: { orgId: access.orgId } };
  if (access.kind === "none") return MATCH_NOTHING;

  const or: Record<string, unknown>[] = [];
  if (access.propertyIds.length) or.push({ propertyId: { in: access.propertyIds } });
  if (access.buildingIds.length) or.push({ id: { in: access.buildingIds } });
  if (access.unitIds.length) or.push({ units: { some: { id: { in: access.unitIds } } } });

  if (or.length === 0) return MATCH_NOTHING;
  return or.length === 1 ? or[0] : { OR: or };
}

/** The Property table, where the scoping column is `id` rather than `propertyId`. */
export function wherePropertyTable(access: Access): Record<string, unknown> {
  if (access.kind === "platform") return { org: { isPlatform: false } };
  if (access.kind === "all") return { orgId: access.orgId };
  if (access.kind === "none") return MATCH_NOTHING;

  const or: Record<string, unknown>[] = [];
  if (access.propertyIds.length) or.push({ id: { in: access.propertyIds } });
  if (access.buildingIds.length) or.push({ buildings: { some: { id: { in: access.buildingIds } } } });
  if (access.unitIds.length) or.push({ units: { some: { id: { in: access.unitIds } } } });
  if (or.length === 0) return MATCH_NOTHING;
  return { orgId: access.orgId, OR: or };
}

/**
 * Expand building-level grants into the units they contain, so tables that carry
 * `unitId` but not `buildingId` still honour a building-scoped assignment.
 */
export async function expandBuildingsToUnits(access: Access): Promise<Access> {
  if (access.kind !== "scoped" || access.buildingIds.length === 0) return access;
  const units = await prisma.unit.findMany({
    where: { buildingId: { in: access.buildingIds } },
    select: { id: true },
  });
  return {
    ...access,
    unitIds: Array.from(new Set([...access.unitIds, ...units.map((u) => u.id)])),
  };
}

/** The concrete property ids an actor may touch with a permission. */
export async function accessiblePropertyIds(access: Access): Promise<string[]> {
  const rows = await prisma.property.findMany({
    where: wherePropertyTable(access),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
