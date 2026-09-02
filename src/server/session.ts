import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

/**
 * Server-side sessions.
 *
 * The cookie carries a random token; the database stores only its SHA-256, so a
 * leaked database dump does not hand over live sessions. The cookie is httpOnly
 * and sameSite=lax — the browser never reads it, and it never rides along on a
 * cross-site request.
 */

export const SESSION_COOKIE = "paltas_session";
const SESSION_DAYS = 7;

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId, token: digest(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

/** Resolve the signed-in user id, or null. Expired rows are cleaned up on sight. */
export async function currentUserId(): Promise<string | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token: digest(token) } });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session.userId;
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token: digest(token) } });
  }
  cookies().delete(SESSION_COOKIE);
}
