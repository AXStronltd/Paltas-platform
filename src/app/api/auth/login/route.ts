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
