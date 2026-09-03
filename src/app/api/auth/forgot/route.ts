import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/server/db";
import { handle, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Ask for a password reset link.
 *
 * Two rules, both about not telling strangers things.
 *
 * The answer is identical whether or not the address exists. An endpoint that
 * says "no such account" is a way to test which of a list of email addresses
 * are registered here, and on a platform where an account implies a booking
 * history that is worth protecting.
 *
 * The token is returned in the response ONLY while no mail service is
 * configured, and the response says so plainly. Emailing it is the correct
 * delivery; until that exists, silently generating a token nobody can receive
 * would be a reset feature that does not reset anything.
 */
const TOKEN_TTL_MINUTES = 30;
const digest = (t: string) => createHash("sha256").update(t).digest("hex");

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ email?: string; audience?: "guest" | "staff" }>(req);
    const email = body?.email?.trim().toLowerCase();
    const audience = body?.audience === "staff" ? "staff" : "guest";

    // Deliberately not a 400: a malformed address gets the same answer as a
    // valid one, so nothing can be learned by probing.
    const sameAnswer = {
      sent: true,
      message: "If that address has an account, a reset link is on its way.",
    };
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ok(sameAnswer);

    const account = audience === "staff"
      ? await prisma.user.findFirst({ where: { email, status: "ACTIVE" }, select: { id: true } })
      : await prisma.guest.findFirst({ where: { email, active: true }, select: { id: true } });

    if (!account) return ok(sameAnswer);

    // One live token per account: issuing a second must retire the first, or a
    // stolen old link stays usable.
    await prisma.passwordReset.updateMany({
      where: audience === "staff" ? { userId: account.id, usedAt: null } : { guestId: account.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("base64url");
    await prisma.passwordReset.create({
      data: {
        tokenHash: digest(token),
        ...(audience === "staff" ? { userId: account.id } : { guestId: account.id }),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
        requestIp: headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
    });

    // No mail service is wired yet. Rather than pretend a link was sent, say so
    // and hand it back — on a platform with no email, that is the difference
    // between a working reset and a dead end. Remove this the day mail exists.
    const mailConfigured = Boolean(process.env.SMTP_URL || process.env.RESEND_API_KEY);
    if (!mailConfigured) {
      return ok({
        ...sameAnswer,
        deliveryPending: true,
        message: "Email delivery is not configured on this deployment yet, so the link is shown here.",
        resetToken: token,
        expiresInMinutes: TOKEN_TTL_MINUTES,
      });
    }

    // TODO: send the link by email once a provider is configured.
    return ok(sameAnswer);
  });
}
