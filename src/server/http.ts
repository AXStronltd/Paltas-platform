import { NextResponse } from "next/server";
import { currentActor } from "./actor";
import { expandBuildingsToUnits, resolveAccess, resolveScope, type Access, type ResolvedScope, type ScopeInput } from "./scope";
import { writeAuditDenial } from "./audit";
import { decide, scopeFilterFor } from "@/lib/security/authorize";
import type { Actor } from "@/lib/security/types";

/**
 * The gate every API route passes through.
 *
 * The requirement is that authorisation is a property of the endpoint, not of
 * the screen that happens to call it. So each route begins by naming the
 * permission it needs and the part of the portfolio it touches, and cannot reach
 * its own body until that has been checked. Hiding a button in the browser is a
 * courtesy to the user; this is the actual control.
 */

export interface ApiError {
  code: string;
  message: string;
  /** On a 403, the engine's explanation — useful in the UI and in support. */
  reason?: string;
  permission?: string;
}

export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(status: number, error: ApiError): NextResponse {
  return NextResponse.json({ error }, { status });
}

export const unauthorized = () =>
  fail(401, { code: "unauthenticated", message: "Sign in to continue." });

export const notFound = (what = "Not found") =>
  fail(404, { code: "not_found", message: what });

export const badRequest = (message: string) =>
  fail(400, { code: "bad_request", message });

export const conflict = (message: string) =>
  fail(409, { code: "conflict", message });

export type GuardResult =
  | { ok: true; actor: Actor; scope: ResolvedScope }
  | { ok: false; response: NextResponse };

/**
 * Authenticate, resolve the scope the request touches, and decide.
 *
 * Call it before doing anything else in a handler. Where the scope comes from
 * the request body, parse the body first and pass the ids in — the check still
 * happens before any write.
 */
export async function guard(permission: string, scopeInput: ScopeInput = {}): Promise<GuardResult> {
  const actor = await currentActor();
  if (!actor) return { ok: false, response: unauthorized() };
  if (!actor.onboardingCompletedAt) return { ok: false, response: fail(403, { code: "onboarding_required", message: "Complete onboarding before accessing the management platform." }) };

  // Platform staff are not confined to one organisation, so their scope is
  // resolved without that restriction. Everyone else stays inside their own.
  const scope = await resolveScope(actor.isPlatformAdmin ? null : actor.orgId, scopeInput);
  if (!scope) {
    // Unknown id and someone else's id are answered identically, so that probing
    // for the existence of another organisation's records tells you nothing.
    return { ok: false, response: notFound("That property, building or unit was not found.") };
  }

  const decision = decide(actor, permission, scope.chain);
  if (!decision.allowed) {
    await writeAuditDenial({
      actor,
      permission,
      entityType: "api",
      propertyId: scope.propertyId,
      reason: decision.reason,
    });
    return {
      ok: false,
      response: fail(403, {
        code: "forbidden",
        message: "You do not have permission to do that.",
        reason: decision.reason,
        permission,
      }),
    };
  }

  return { ok: true, actor, scope };
}

export type ListGuardResult =
  | { ok: true; actor: Actor; access: Access }
  | { ok: false; response: NextResponse };

/**
 * The same check for endpoints that list across the portfolio, where there is no
 * single scope to name. Instead of a yes/no it yields the filter the query must
 * be narrowed by — which is what keeps a manager assigned to Property A from
 * seeing Property B in a collection response.
 */
export async function guardList(permission: string): Promise<ListGuardResult> {
  const actor = await currentActor();
  if (!actor) return { ok: false, response: unauthorized() };
  if (!actor.onboardingCompletedAt) return { ok: false, response: fail(403, { code: "onboarding_required", message: "Complete onboarding before accessing the management platform." }) };

  const filter = scopeFilterFor(actor, permission);
  if (filter.kind === "none") {
    await writeAuditDenial({
      actor,
      permission,
      entityType: "api",
      reason: `No scope grants "${permission}".`,
    });
    return {
      ok: false,
      response: fail(403, {
        code: "forbidden",
        message: "You do not have permission to view this.",
        reason: `No property grants you "${permission}".`,
        permission,
      }),
    };
  }

  // Building-level grants are expanded to the units beneath them here, once, so
  // that every table keyed by unit honours them without each route remembering.
  const access = await expandBuildingsToUnits(await resolveAccess(actor.orgId, filter));
  if (access.kind === "none") {
    return {
      ok: false,
      response: fail(403, {
        code: "forbidden",
        message: "You do not have permission to view this.",
        reason: `No property grants you "${permission}".`,
        permission,
      }),
    };
  }

  return { ok: true, actor, access };
}

/** Parse a JSON body, returning null rather than throwing on malformed input. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Wrap a handler so an unexpected throw becomes a 500 with a stable shape
 * instead of an HTML error page the client cannot parse.
 */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    console.error("[paltas api]", e);
    return fail(500, { code: "server_error", message: "Something went wrong on our side." });
  }
}

/**
 * Authorise a record that may not belong to a property yet.
 *
 * Leads and developments are the awkward case: an enquiry from someone still
 * browsing, or a development not yet built, has no property to scope against.
 * Guarding those at organisation scope would refuse every property-scoped
 * agent, since their grants live one level down — which is exactly the bug this
 * exists to have fixed.
 *
 * So when there is a property, it is guarded normally. When there is not, the
 * question becomes "may this person do this anywhere at all?", which `guardList`
 * already answers. Someone who can log leads for any property they hold may log
 * a general enquiry; someone who can log none still cannot.
 */
export async function guardMaybeScoped(
  permission: string,
  propertyId?: string | null,
): Promise<{ ok: true; actor: Actor } | { ok: false; response: NextResponse }> {
  if (propertyId) {
    const g = await guard(permission, { propertyId });
    return g.ok ? { ok: true, actor: g.actor } : g;
  }
  const g = await guardList(permission);
  return g.ok ? { ok: true, actor: g.actor } : g;
}

/**
 * Paltas platform staff only.
 *
 * Distinct from every other check here. `guard()` asks whether someone holds a
 * permission somewhere; this asks whether they are Paltas rather than a
 * customer, which is not a permission and deliberately cannot be granted by
 * one. `isPlatformAdmin` is a column on User precisely so that no permission
 * edit, however careless, can mint platform authority.
 *
 * The refusal is a 404 rather than a 403. A tenant probing for an operations
 * console should not learn that one exists.
 */
export async function guardPlatform(
  action: string,
): Promise<{ ok: true; actor: Actor } | { ok: false; response: NextResponse }> {
  const actor = await currentActor();
  if (!actor) return { ok: false, response: unauthorized() };

  if (!actor.isPlatformAdmin) {
    await writeAuditDenial({
      actor,
      permission: action,
      entityType: "platform",
      reason: "Not Paltas platform staff.",
    });
    return { ok: false, response: fail(404, { code: "not_found", message: "Not found." }) };
  }
  return { ok: true, actor };
}
