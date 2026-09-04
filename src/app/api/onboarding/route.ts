import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentActor } from "@/server/actor";
import { badRequest, handle, ok, unauthorized } from "@/server/http";
import { staffDestination } from "@/lib/auth/destination";
import { storageEnabled } from "@/server/storage";

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
    // Where they go next, decided by the same helper the sign-in forms use so
    // the answer cannot drift between the two places that ask it.
    const destination = staffDestination({
      onboardingRequired: user.status !== "ACTIVE",
      dashboardRole: user.onboardingRole,
    });
    return ok({ onboardingCompleted: true, pendingApproval: user.status !== "ACTIVE", destination, user });
  });
}