import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/server/db";
import { mailEnabled } from "@/server/mail";
import { notifyPasswordReset } from "@/server/notifications";
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

    /*
     * Name and, for a guest, language and market — so the email is addressed to
     * a person and written in the language they chose. Staff carry no locale of
     * their own, so their message falls back to English rather than guessing.
     */
    const account = audience === "staff"
      ? await prisma.user.findFirst({
          where: { email, status: "ACTIVE" },
          select: { id: true, name: true },
        }).then((u) => (u ? { ...u, locale: null as string | null, country: null as string | null } : null))
      : await prisma.guest.findFirst({
          where: { email, active: true },
          select: { id: true, name: true, locale: true, country: true },
        });

    if (!account) return ok(sameAnswer);

    // One live token per account: issuing a second must retire the first, or a
    // stolen old link stays usable.
    await prisma.passwordReset.updateMany({
      where: audience === "staff" ? { userId: account.id, usedAt: null } : { guestId: account.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("base64url");
    const reset = await prisma.passwordReset.create({
      data: {
        tokenHash: digest(token),
        ...(audience === "staff" ? { userId: account.id } : { guestId: account.id }),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
        requestIp: headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      },
      select: { id: true },
    });

    /*
     * On a deployment with no mail provider the link is handed back instead.
     *
     * It reads like a hole and it is the opposite of one: without it, a
     * deployment that cannot send email would mint a token nobody can ever
     * receive and answer "a link is on its way", which locks people out with
     * no error anywhere. `mailEnabled` deliberately does not count SMTP_URL,
     * so setting a variable this code cannot act on will not silently switch
     * this branch off.
     */
    if (!mailEnabled()) {
      return ok({
        ...sameAnswer,
        deliveryPending: true,
        message: "Email delivery is not configured on this deployment yet, so the link is shown here.",
        resetToken: token,
        expiresInMinutes: TOKEN_TTL_MINUTES,
      });
    }

    /*
     * The one place the plain token is allowed to go.
     *
     * Awaited, but its failures are swallowed inside: the answer to this
     * request must not vary with whether the mail provider was reachable,
     * because a caller who can tell the difference has learned that the
     * address exists.
     */
    await notifyPasswordReset({
      resetId: reset.id,
      to: email,
      name: account.name,
      locale: account.locale,
      country: account.country,
      token,
      expiresInMinutes: TOKEN_TTL_MINUTES,
    });

    return ok(sameAnswer);
  });
}
