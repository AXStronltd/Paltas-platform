import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentActor } from "@/server/actor";
import { badRequest, handle, ok, unauthorized } from "@/server/http";
import { staffDestination } from "@/lib/auth/destination";
import { landingFor } from "@/lib/auth/workspaces";
import { storageEnabled } from "@/server/storage";
import { writeAudit } from "@/server/audit";
import { activateAccount, ROLE_FOR, roleDefinition } from "@/server/activation";
import { record } from "@/server/notifications";
import { BUSINESS_KEYS } from "@/app/onboarding/steps";

export const dynamic = "force-dynamic";

const ROLES = ["developer", "landlord", "agent", "hotel", "seller", "resident"] as const;
type OnboardingRole = (typeof ROLES)[number];

/**
 * What the form is allowed to put in `onboardingData`.
 *
 * The column is JSON, so without a list it stores whatever is posted at it —
 * and it is written by the applicant, read by the approver, and rendered on
 * screens that trust it. A whitelist keeps it to the answers the form actually
 * asks for.
 */
const ALLOWED_KEYS = new Set<string>([
  ...BUSINESS_KEYS,
  // The role-specific steps, which predate the business half.
  "operatingCountry", "projects", "units", "location", "type", "payout",
  "agency", "license", "area", "listings", "rooms", "propertyType", "price",
  "ownership", "moveIn", "landlord", "idtype", "idnum", "kra", "consent",
]);

/** Trim, cap and drop anything the form does not ask for. */
function cleanDetails(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) out[key] = trimmed.slice(0, 2000);
  }
  return out;
}

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();
    const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { name: true, phone: true, onboardingRole: true, onboardingData: true, onboardingCompletedAt: true, requestedRole: true } });
    if (!user) return unauthorized();
    // Whether documents can be uploaded at all. Without object storage the
    // upload endpoint answers 503, and a form that keeps insisting on a file
    // the platform cannot accept is a dead end with no way out of it.
    return ok({
      onboardingCompleted: Boolean(user.onboardingCompletedAt),
      role: user.onboardingRole ?? user.requestedRole ?? null,
      uploadsAvailable: storageEnabled(),
      profile: user,
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();
    const body = await req.json().catch(() => null) as { role?: OnboardingRole; name?: unknown; phone?: unknown; country?: unknown; details?: unknown } | null;
    if (!body || !ROLES.includes(body.role as OnboardingRole)) return badRequest(`Choose one of: ${ROLES.join(", ")}.`);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2) return badRequest("Please provide your full name.");
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!phone) return badRequest("Please provide your phone number.");
    const country = typeof body.country === "string" ? body.country.trim().slice(0, 2).toUpperCase() : "";
    if (!country) return badRequest("Please provide your country.");

    const details = cleanDetails(body.details);
    // The attestation at the end of every role's verification step. It is a
    // statement the approver relies on, so it is checked here rather than only
    // in the browser, where a disabled button is not a promise.
    if (details.consent !== "yes") return badRequest("Please confirm the declaration before submitting.");
    // Documents are demanded only when the platform can actually take one.
    // Where storage is unconfigured this used to refuse every submission for
    // every role but resident, so an applicant filled the form, was told to
    // upload an identity document, found the upload answering 503, and had no
    // route forward at all — their name and role were never recorded.
    //
    // This used to be safe because the approval queue was the real gate: an
    // account whose documents were not APPROVED could not be activated, so
    // accepting a submission without them lost nothing. That is no longer
    // true. Submitting this form now activates the account, which means the
    // upload below is the only point at which an identity document is ever
    // demanded, and where object storage is unconfigured it is not demanded at
    // all — an account can reach a dashboard having uploaded nothing.
    //
    // The documents that are collected are still unreviewed at the moment
    // access is granted. Reviewing them afterwards is a decision for whoever
    // runs the platform; nothing here waits for it.
    if (storageEnabled()) {
      const documents = await prisma.verificationDocument.findMany({ where: { userId: actor.id, status: "PENDING" }, select: { type: true } });
      const documentTypes = new Set(documents.map((document) => document.type));
      if (body.role !== "resident" && !documentTypes.has("IDENTITY")) return badRequest("Upload an identity document before submitting onboarding.");
      if (body.role === "landlord" && !documentTypes.has("OWNERSHIP")) return badRequest("Upload ownership or title-deed evidence before submitting onboarding.");
    }
    // Access is granted here rather than by an approver. Completing the form
    // with everything it asks for is what activates the account, so nobody
    // finishes onboarding and then waits.
    //
    // Only from PENDING or INVITED. SUSPENDED and REJECTED are decisions
    // somebody made about this account, and the schema keeps REJECTED
    // precisely so that signing up again does not undo one — re-submitting
    // this form must not either. Those accounts keep their status and are told
    // nothing new by the response, which is the same shape for all of them.
    const before = await prisma.user.findUnique({ where: { id: actor.id }, select: { status: true } });
    const activates = before?.status === "PENDING" || before?.status === "INVITED";

    // The answers are saved first, and the status is deliberately not touched
    // here. activateAccount below owns that transition, because flipping it
    // to ACTIVE at this point would make that function short-circuit — it
    // returns early on an account that is already active, so the role and its
    // assignment would never be created and the result would be an activated
    // account holding no permissions at all: a dashboard that refuses every
    // screen it offers. The merge produced exactly that, and it is the kind of
    // failure that looks like success until somebody clicks something.
    const user = await prisma.user.update({
      where: { id: actor.id },
      data: {
        name, phone,
        onboardingRole: body.role,
        onboardingData: { country, ...details },
        onboardingCompletedAt: new Date(),
      },
      select: { id: true, name: true, email: true, onboardingRole: true, onboardingCompletedAt: true, status: true },
    });
    // The role recorded here is what the approver is handed, so a change to it
    // is worth being able to see afterwards — the same reasoning that makes
    // /api/me audit a self-edit. The declared role and country are recorded;
    // the free-text answers and document numbers are not, since an audit trail
    // that duplicates identity documents is a second place to leak them from.
    await writeAudit({
      actor,
      action: "user.onboarding.submit",
      entityType: "User",
      entityId: actor.id,
      summary: activates
        ? `${name} completed onboarding as ${body.role} (${country}) and was activated.`
        : `${name} completed onboarding as ${body.role} (${country}); status left at ${user.status}.`,
      before: { onboardingRole: null, status: before?.status ?? null },
      after: { onboardingRole: body.role, status: user.status },
    });

    /*
     * Activate on completion, rather than waiting for somebody to approve.
     *
     * The email is already verified before this point and cannot not be: the
     * Supabase exchange refuses any identity without email_confirmed_at, so
     * nobody reaches this form — or signs in at all — on an unconfirmed
     * address. Requiring a second, human approval after that was a queue that
     * had to be staffed before a single customer could do anything.
     *
     * What it grants is a role over their own organisation and nothing else.
     * Every request is authorised against the organisation the record belongs
     * to, so this opens a workspace holding their own properties rather than
     * any reach into another tenant's.
     */
    // Narrowed by the ROLES.includes check at the top of this handler, which
    // TypeScript cannot see through — the guard tests a cast, so the original
    // stays optional as far as the compiler is concerned.
    const declaredRole = body.role as OnboardingRole;
    // Only where the status allows it. SUSPENDED and REJECTED are decisions
    // somebody made about this account, and the schema keeps REJECTED
    // precisely so that signing up again does not undo one — resubmitting this
    // form must not either.
    const activated = activates
      ? await activateAccount({
          userId: actor.id,
          orgId: actor.orgId,
          roleKey: ROLE_FOR[declaredRole] ?? "property_manager",
          isOwner: declaredRole === "landlord",
        })
      : { ok: false as const, reason: `Account is ${before?.status?.toLowerCase() ?? "unknown"}.` };

    if (activated.ok) {
      await record({
        userId: actor.id, kind: "APPROVAL",
        title: "Your PALTAS account is ready",
        body: "Your dashboard is open. Documents you upload are still reviewed.",
        href: "/manage", entityId: `activated:${actor.id}`,
      });
    }

    const status = activated.ok ? "ACTIVE" : user.status;

    // Where they go next, decided by the same helper the sign-in forms use so
    // the answer cannot drift between the two places that ask it.
    // Freshly activated, so the actor loaded at the top of this handler predates
    // the role that was just granted. The permissions the new role carries are
    // read from its definition rather than from that stale actor.
    const granted = activated.ok ? roleDefinition(activated.role)?.permissions ?? [] : [];
    const destination = staffDestination({
      onboardingRequired: status !== "ACTIVE",
      dashboardRole: user.onboardingRole,
      landing: status === "ACTIVE"
        ? landingFor({
            dashboardRole: user.onboardingRole,
            permissions: granted,
            isPlatformAdmin: actor.isPlatformAdmin,
          })
        : null,
    });
    return ok({
      onboardingCompleted: true,
      pendingApproval: status !== "ACTIVE",
      destination,
      user: { ...user, status },
    });
  });
}

/**
 * Save progress, without finishing.
 *
 * The specification asks for persistence on every step change rather than only
 * at the end: someone who closes the tab on step 4 comes back to step 4 with
 * steps 1–3 intact. This is the endpoint that makes that true.
 *
 * Deliberately weaker than POST. It records a draft, so it does not demand the
 * consent box, the documents, or a complete step — a half-filled form is
 * exactly what it exists to keep. It cannot complete onboarding and it cannot
 * change status: `onboardingCompletedAt` is only ever written by POST, above,
 * so there is no route to an active account that skips the checks there.
 *
 * The draft lives in the same `onboardingData` column as the finished answers,
 * which is why there is no migration here. `currentStep` rides along in it.
 */
export async function PATCH(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { onboardingCompletedAt: true, onboardingData: true },
    });
    if (!user) return unauthorized();
    // Already through. A late autosave from a tab left open on the form must
    // not reopen a completed application or overwrite what was submitted.
    if (user.onboardingCompletedAt) return ok({ saved: false, reason: "completed" });

    const body = await req.json().catch(() => null) as { role?: unknown; step?: unknown; details?: unknown } | null;
    if (!body) return badRequest("Nothing to save.");

    const step = Number(body.step);
    const role = ROLES.includes(body.role as OnboardingRole) ? (body.role as OnboardingRole) : undefined;
    const existing = (user.onboardingData && typeof user.onboardingData === "object" && !Array.isArray(user.onboardingData)
      ? user.onboardingData
      : {}) as Record<string, unknown>;

    await prisma.user.update({
      where: { id: actor.id },
      data: {
        ...(role ? { onboardingRole: role } : {}),
        onboardingData: {
          ...existing,
          ...cleanDetails(body.details),
          currentStep: Number.isFinite(step) && step >= 0 ? Math.min(step, 20) : 0,
        },
      },
    });

    // Not audited. This fires on every step change of every abandoned form,
    // and an audit trail that is nine-tenths autosave is one nobody reads.
    return ok({ saved: true });
  });
}
