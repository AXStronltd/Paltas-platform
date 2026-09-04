import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/server/db";
import { createSession } from "@/server/session";
import { createGuestSession } from "@/server/guest";
import { effectivePermissionKeys } from "@/lib/security/authorize";
import { ALL_PERMISSIONS } from "@/lib/security/permissions";
import { loadActor } from "@/server/actor";
import { badRequest, fail, handle, ok, readJson } from "@/server/http";
import { getSupabaseUser, supabaseConfigured } from "@/server/supabase";
import { hashPassword } from "@/server/password";

export const dynamic = "force-dynamic";

/** Turn a verified Supabase identity into the platform's existing authority. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    if (!supabaseConfigured()) return fail(503, { code: "auth_not_configured", message: "Authentication is not configured." });
    const body = await readJson<{ accessToken?: string; audience?: "guest" | "staff" }>(req);
    if (!body?.accessToken || (body.audience !== "guest" && body.audience !== "staff")) {
      return badRequest("A valid authentication session is required.");
    }

    const identity = await getSupabaseUser(body.accessToken);
    if (!identity?.email_confirmed_at) {
      return fail(403, { code: "email_not_verified", message: "Please verify your email before signing in." });
    }
    const email = identity.email!.toLowerCase().trim();
    const h = headers();
    const meta = {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    };

    if (body.audience === "guest") {
      let guest = await prisma.guest.findFirst({ where: { OR: [{ supabaseUserId: identity.id }, { email }] } });
      if (!guest) {
        guest = await prisma.guest.create({
          data: {
            email,
            name: (identity.user_metadata?.full_name || identity.user_metadata?.name || email.split("@")[0]).slice(0, 120),
            passwordHash: await hashPassword(randomBytes(32).toString("hex")),
            supabaseUserId: identity.id,
          },
        });
      }
      if (!guest.active) return fail(403, { code: "account_inactive", message: "This account is inactive." });
      if (guest.supabaseUserId !== identity.id) {
        await prisma.guest.update({ where: { id: guest.id }, data: { supabaseUserId: identity.id } });
      }
      await createGuestSession(guest.id, meta);
      return ok({ guest: { id: guest.id, name: guest.name, email: guest.email } });
    }

    let user = await prisma.user.findFirst({ where: { OR: [{ supabaseUserId: identity.id }, { email }] } });
    if (!user) {
      const requestedRole = identity.user_metadata?.role;
      if (!["landlord", "agent", "hotel", "developer"].includes(requestedRole)) {
        return fail(403, { code: "account_not_found", message: "Your account is not registered with PALTAS." });
      }
      const org = await prisma.organization.create({ data: { name: String(identity.user_metadata?.businessName || identity.user_metadata?.name || email).slice(0, 120), country: String(identity.user_metadata?.country || "KE").slice(0, 2).toUpperCase(), approved: false }, select: { id: true } });
      user = await prisma.user.create({
        data: { orgId: org.id, email, name: String(identity.user_metadata?.name || email.split("@")[0]).slice(0, 120), passwordHash: await hashPassword(randomBytes(32).toString("hex")), supabaseUserId: identity.id, status: "PENDING", requestedRole },
      });
    }
    if (!user) return fail(403, { code: "account_not_found", message: "Your account is not registered with PALTAS." });
    if (user.status === "SUSPENDED") return fail(403, { code: "account_suspended", message: "This account has been suspended." });
    if (user.status === "REJECTED") return fail(403, { code: "account_rejected", message: "This account was not approved." });
    if (user.supabaseUserId !== identity.id) {
      await prisma.user.update({ where: { id: user.id }, data: { supabaseUserId: identity.id } });
    }
    await createSession(user.id, meta);
    const actor = await loadActor(user.id);
    return ok({
      user: { id: user.id, name: user.name, email: user.email, isOwner: user.isOwner },
      roles: actor?.roles ?? [],
      permissions: actor ? effectivePermissionKeys(actor, ALL_PERMISSIONS) : [],
      onboardingRequired: !user.onboardingCompletedAt || user.status === "PENDING",
    });
  });
}