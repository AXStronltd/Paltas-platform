import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/password";
import { createGuestSession } from "@/server/guest";
import { badRequest, fail, handle, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ email?: string; password?: string }>(req);
    if (!body?.email || !body?.password) return badRequest("Email and password are required.");

    const guest = await prisma.guest.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    // One message for both cases: whether an account exists is not the
    // caller's business.
    const invalid = () => fail(401, { code: "invalid_credentials", message: "Email or password is incorrect." });
    if (!guest || !guest.active) return invalid();
    if (!(await verifyPassword(body.password, guest.passwordHash))) return invalid();

    const h = headers();
    await createGuestSession(guest.id, {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    });

    return ok({ guest: { id: guest.id, name: guest.name, email: guest.email } });
  });
}
