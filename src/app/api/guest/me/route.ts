import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentGuest } from "@/server/guest";
import { fail, handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** Who is browsing. Returns null rather than 401 — being signed out is normal. */
export async function GET(): Promise<NextResponse> {
  return handle(async () => ok({ guest: await currentGuest() }));
}

/**
 * Change your own details.
 *
 * Authorised by holding the session, not by any permission — you may always
 * edit yourself. Which is exactly why the editable set is narrow.
 *
 * The email address is deliberately not editable here. It is the identity the
 * account is found by and signs in with; letting a session rewrite it turns a
 * borrowed phone into an account takeover, and changing it properly needs
 * verification of the new address, which is a separate piece of work.
 */
export async function PATCH(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const guest = await currentGuest();
    if (!guest) return fail(401, { code: "unauthenticated", message: "Sign in to continue." });

    const body = (await req.json().catch(() => null)) as {
      name?: unknown; phone?: unknown; country?: unknown; locale?: unknown;
    } | null;
    if (!body) return fail(400, { code: "bad_request", message: "Expected a JSON body." });

    const name = typeof body.name === "string" ? body.name.trim() : undefined;
    if (name !== undefined && name.length < 2) {
      return fail(400, { code: "bad_request", message: "A name needs at least two characters." });
    }

    const updated = await prisma.guest.update({
      where: { id: guest.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(typeof body.phone === "string" ? { phone: body.phone.trim() || null } : {}),
        // Two letters, upper case — the country is used to pick a market and a
        // currency, so a malformed one would change prices.
        ...(typeof body.country === "string"
          ? { country: body.country.trim().slice(0, 2).toUpperCase() || null } : {}),
        ...(typeof body.locale === "string" ? { locale: body.locale.trim().slice(0, 12) || null } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, country: true, locale: true },
    });

    return ok({ guest: updated });
  });
}
