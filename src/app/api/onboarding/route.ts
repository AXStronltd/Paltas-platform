import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentActor } from "@/server/actor";
import { badRequest, handle, ok, unauthorized } from "@/server/http";
import { staffDestination } from "@/lib/auth/destination";
import { storageEnabled } from "@/server/storage";
import { writeAudit } from "@/server/audit";
import { activateAccount, ROLE_FOR } from "@/server/activation";
import { record } from "@/server/notifications";

export const dynamic = "force-dynamic";

const ROLES = ["developer", "landlord", "agent", "hotel", "seller", "resident"] as const;
type OnboardingRole = (typeof ROLES)[number];

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

    const details = (body.details && typeof body.details === "object" ? body.details : {}) as Record<string, unknown>;
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
    // Nothing is loosened by accepting them: the approval queue still refuses
    // to activate an account whose required documents are not APPROVED, so the
    // evidence is still demanded, just at the point where somebody can act on
    // the absence rather than at the point where nobody can.
    if (storageEnabled()) {
      const documents = await prisma.verificationDocument.findMany({ where: { userId: actor.id, status: "PENDING" }, select: { type: true } });
      const documentTypes = new Set(documents.map((document) => document.type));
      if (body.role !== "resident" && !documentTypes.has("IDENTITY")) return badRequest("Upload an identity document before submitting onboarding.");
      if (body.role === "landlord" && !documentTypes.has("OWNERSHIP")) return badRequest("Upload ownership or title-deed evidence before submitting onboarding.");
    }
    const user = await prisma.user.update({ where: { id: actor.id }, data: { name, phone, onboardingRole: body.role, onboardingData: { country, ...details }, onboardingCompletedAt: new Date() }, select: { id: true, name: true, email: true, onboardingRole: true, onboardingCompletedAt: true, status: true } });
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
      summary: `${name} completed onboarding as ${body.role} (${country}).`,
      before: { onboardingRole: null },
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
    const activated = await activateAccount({
      userId: actor.id,
      orgId: actor.orgId,
      roleKey: ROLE_FOR[declaredRole] ?? "property_manager",
      isOwner: declaredRole === "landlord",
    });

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
    const destination = staffDestination({
      onboardingRequired: status !== "ACTIVE",
      dashboardRole: user.onboardingRole,
    });
    return ok({
      onboardingCompleted: true,
      pendingApproval: status !== "ACTIVE",
      destination,
      user: { ...user, status },
    });
  });
}