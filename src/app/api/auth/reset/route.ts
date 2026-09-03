import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import { badRequest, fail, handle, ok, readJson } from "@/server/http";
import { hashPassword } from "@/server/password";

export const dynamic = "force-dynamic";

/**
 * Set a new password with a reset token.
 *
 * The token is looked up by digest, must be unused, and must not have expired.
 * It is marked used inside the same transaction as the password change, so a
 * link cannot be replayed — including by two requests arriving together.
 *
 * Every existing session for that account is destroyed. Someone resetting a
 * password is frequently doing it because somebody else has been in the
 * account, and leaving that session alive defeats the whole exercise.
 */
const MIN_PASSWORD = 10;
const digest = (t: string) => createHash("sha256").update(t).digest("hex");

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ token?: string; password?: string }>(req);
    if (!body?.token) return badRequest("That reset link is not valid.");
    if (!body.password || body.password.length < MIN_PASSWORD) {
      return badRequest(`Please choose a password of at least ${MIN_PASSWORD} characters.`);
    }

    const reset = await prisma.passwordReset.findUnique({
      where: { tokenHash: digest(body.token) },
      select: { id: true, userId: true, guestId: true, expiresAt: true, usedAt: true },
    });

    // One message for every failure: expired, used, and never existed are all
    // "this link no longer works", and distinguishing them helps nobody but an
    // attacker holding a list of tokens.
    const dead = () => fail(400, {
      code: "invalid_token",
      message: "That reset link has expired or has already been used. Please request a new one.",
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) return dead();

    const passwordHash = await hashPassword(body.password);

    await prisma.$transaction(async (tx) => {
      // Marked used first, and scoped to `usedAt: null`, so two requests racing
      // the same link cannot both succeed.
      const claimed = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("already used");

      if (reset.userId) {
        await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
        // Whoever else was signed in is signed out.
        await tx.session.deleteMany({ where: { userId: reset.userId } });
      } else if (reset.guestId) {
        await tx.guest.update({ where: { id: reset.guestId }, data: { passwordHash } });
        await tx.guestSession.deleteMany({ where: { guestId: reset.guestId } });
      }
    }).catch(() => null);

    const stillUnused = await prisma.passwordReset.findUnique({
      where: { id: reset.id }, select: { usedAt: true },
    });
    if (!stillUnused?.usedAt) return dead();

    return ok({
      reset: true,
      message: "Your password has been changed. Please sign in with it.",
    });
  });
}
