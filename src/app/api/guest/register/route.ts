import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/password";
import { createGuestSession } from "@/server/guest";
import { badRequest, conflict, handle, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/** Create a marketplace account. Signs in on success. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      email?: string; name?: string; password?: string; phone?: string;
      country?: string; locale?: string;
    }>(req);
    if (!body?.email || !body.name?.trim() || !body.password) {
      return badRequest("name, email and password are required.");
    }
    // Long enough to matter, without imposing rules that push people to
    // Password1! — length is what actually helps.
    if (body.password.length < 10) {
      return badRequest("Use a password of at least 10 characters.");
    }

    const email = body.email.toLowerCase().trim();
    if (await prisma.guest.findUnique({ where: { email }, select: { id: true } })) {
      return conflict("An account with that email already exists.");
    }

    const guest = await prisma.guest.create({
      data: {
        email,
        name: body.name.trim(),
        phone: body.phone?.trim(),
        country: body.country?.toUpperCase(),
        locale: body.locale,
        passwordHash: await hashPassword(body.password),
      },
    });

    const h = headers();
    await createGuestSession(guest.id, {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    });

    return ok({ guest: { id: guest.id, name: guest.name, email: guest.email } }, 201);
  });
}
