import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentActor } from "@/server/actor";
import { fail, handle, ok, unauthorized } from "@/server/http";
import { writeAudit, changes } from "@/server/audit";
import { buildScopeChain, decide, effectivePermissionKeys } from "@/lib/security/authorize";
import { ALL_PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Who am I, and what may I do?
 *
 * The browser needs this to decide what to render, and it is the one place the
 * frontend is trusted with the permission model — because everything it returns
 * has already been derived from the same engine the API enforces with. A client
 * that ignored this response entirely would gain nothing: the endpoints would
 * still refuse it.
 *
 * `properties` carries a per-property permission list rather than one global set,
 * so a manager who may edit units at Kilimani Heights but only view them at
 * Nyali Court gets the right buttons on each screen.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();

    const properties = await visibleProperties(actor);

    return ok({
      user: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        isOwner: actor.isOwner,
        isPlatformAdmin: actor.isPlatformAdmin,
        status: actor.status,
        onboardingCompleted: Boolean(actor.onboardingCompletedAt),
      },
      orgId: actor.orgId,
      roles: actor.roles,
      /** Held somewhere — enough to decide whether a whole section appears. */
      permissions: effectivePermissionKeys(actor, ALL_PERMISSIONS),
      properties: properties.map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city,
        /** Which tenant this belongs to — only meaningful to platform staff. */
        orgId: p.orgId,
        orgName: p.org?.name ?? null,
        permissions: ALL_PERMISSIONS.filter(
          // Authorised against the property's *own* organisation, not the
          // actor's — they differ for Paltas staff, and using the actor's would
          // silently refuse everything they are here to do.
          (perm) => decide(actor, perm, buildScopeChain({ orgId: p.orgId, propertyId: p.id })).allowed,
        ),
      })),
    });
  });
}

const PROPERTY_FIELDS = {
  id: true,
  name: true,
  city: true,
  orgId: true,
  org: { select: { name: true } },
} as const;

/**
 * The properties this user has any reach into at all.
 *
 * Paltas platform staff see every tenant's; an owner sees their own
 * organisation's; everyone else sees only what their grants name, resolved up
 * from building- and unit-level grants to the property that contains them.
 */

/**
 * Change your own name or phone number.
 *
 * Authorised by holding the session rather than by any permission — everyone
 * may edit themselves, including a guard with almost no grants. Which is
 * precisely why the editable set is this narrow.
 *
 * Deliberately NOT editable here:
 *
 *   email      the identity the account signs in with; changing it needs
 *              verification of the new address, and letting a session rewrite
 *              it turns a borrowed laptop into an account takeover.
 *   isOwner
 *   isPlatformAdmin
 *   status     these decide authority. They are columns rather than
 *              permissions exactly so that no self-service edit can mint them,
 *              and this endpoint must not become the hole in that.
 *   orgId      which tenant you belong to.
 *
 * Recorded in the audit trail like any other change to a user, so a name that
 * changes the day before something goes wrong is visible afterwards.
 */
export async function PATCH(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();

    const body = (await req.json().catch(() => null)) as { name?: unknown; phone?: unknown } | null;
    if (!body) return fail(400, { code: "bad_request", message: "Expected a JSON body." });

    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    if (name !== undefined && name.length < 2) {
      return fail(400, { code: "bad_request", message: "A name needs at least two characters." });
    }
    if (name === undefined && typeof body.phone !== "string") {
      return fail(400, { code: "bad_request", message: "Nothing to change." });
    }

    const before = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { id: true, name: true, phone: true },
    });

    const updated = await prisma.user.update({
      where: { id: actor.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(typeof body.phone === "string" ? { phone: body.phone.trim() || null } : {}),
      },
      select: { id: true, name: true, email: true, phone: true },
    });

    await writeAudit({
      actor,
      action: "user.self.update",
      entityType: "User",
      entityId: actor.id,
      summary: `${before?.name ?? actor.name} updated their own profile`
        + (name !== undefined && name !== before?.name ? ` — now "${name}"` : "") + ".",
      ...changes(before ?? {}, updated),
    });

    return ok({ user: updated });
  });
}

async function visibleProperties(actor: { id: string; orgId: string; isOwner: boolean; isPlatformAdmin: boolean }) {
  const { id: userId, orgId, isOwner, isPlatformAdmin } = actor;

  if (isPlatformAdmin) {
    return prisma.property.findMany({
      // The platform's own organisation owns no properties, and is not a tenant.
      where: { org: { isPlatform: false } },
      select: PROPERTY_FIELDS,
      orderBy: [{ org: { name: "asc" } }, { name: "asc" }],
    });
  }

  if (isOwner) {
    return prisma.property.findMany({ where: { orgId }, select: PROPERTY_FIELDS, orderBy: { name: "asc" } });
  }

  const [roleAssignments, grants] = await Promise.all([
    prisma.roleAssignment.findMany({ where: { userId }, select: { scopeType: true, scopeId: true } }),
    prisma.permissionGrant.findMany({ where: { userId, effect: "ALLOW" }, select: { scopeType: true, scopeId: true } }),
  ]);
  const scopes = [...roleAssignments, ...grants];

  if (scopes.some((s) => s.scopeType === "ORGANIZATION" && s.scopeId === orgId)) {
    return prisma.property.findMany({ where: { orgId }, select: PROPERTY_FIELDS, orderBy: { name: "asc" } });
  }

  const propertyIds = scopes.filter((s) => s.scopeType === "PROPERTY").map((s) => s.scopeId);
  const buildingIds = scopes.filter((s) => s.scopeType === "BUILDING").map((s) => s.scopeId);
  const unitIds = scopes.filter((s) => s.scopeType === "UNIT").map((s) => s.scopeId);

  return prisma.property.findMany({
    where: {
      orgId,
      OR: [
        { id: { in: propertyIds } },
        ...(buildingIds.length ? [{ buildings: { some: { id: { in: buildingIds } } } }] : []),
        ...(unitIds.length ? [{ units: { some: { id: { in: unitIds } } } }] : []),
      ],
    },
    select: PROPERTY_FIELDS,
    orderBy: { name: "asc" },
  });
}
