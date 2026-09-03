import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/password";
import { createSession } from "@/server/session";
import { badRequest, fail, handle, ok, readJson } from "@/server/http";
import { loadActor } from "@/server/actor";
import { effectivePermissionKeys } from "@/lib/security/authorize";
import { ALL_PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Sign in to the management side of PALTAS.
 *
 * A suspended account is refused here rather than at each endpoint, so an
 * account the owner has switched off stops working immediately rather than at
 * the next permission check.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ email?: string; password?: string }>(req);
    if (!body?.email || !body?.password) return badRequest("Email and password are required.");

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    // One message for "no such account" and "wrong password" — the difference is
    // not the caller's business.
    const invalid = () => fail(401, { code: "invalid_credentials", message: "Email or password is incorrect." });
    if (!user) return invalid();

    const okPassword = await verifyPassword(body.password, user.passwordHash);
    if (!okPassword) return invalid();

    if (user.status === "SUSPENDED") {
      return fail(403, { code: "account_suspended", message: "This account has been suspended." });
    }

    /*
     * A pending or rejected account is told why, and given no session.
     *
     * The password was correct, so this leaks nothing — the person already
     * knows the account exists. Letting them in with a session that can do
     * nothing would be worse: every page would refuse them without saying why,
     * and they would conclude the platform is broken rather than that they are
     * waiting on us.
     */
    if (user.status === "PENDING") {
      return fail(403, {
        code: "account_pending",
        message: "Your account is still with PALTAS for approval. We will email you when it is ready.",
      });
    }
    if (user.status === "REJECTED") {
      return fail(403, {
        code: "account_rejected",
        message: "This account was not approved. Please contact PALTAS if you think that is wrong.",
      });
    }

    const h = headers();
    await createSession(user.id, {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    });

    const actor = await loadActor(user.id);
    return ok({
      user: { id: user.id, name: user.name, email: user.email, isOwner: user.isOwner, title: user.title },
      roles: actor?.roles ?? [],
      permissions: actor ? effectivePermissionKeys(actor, ALL_PERMISSIONS) : [],
    });
  });
}
