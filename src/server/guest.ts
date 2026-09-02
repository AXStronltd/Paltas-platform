import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

/**
 * Guest sessions — the customer side of the platform.
 *
 * Deliberately a separate mechanism from `src/server/session.ts`, which
 * authenticates staff. Two reasons:
 *
 *  - A guest holds no permissions. Running them through `guard()` would mean
 *    inventing a scope for someone who has no place in the property tree.
 *  - A leaked guest cookie must not become a staff session, and the surest way
 *    to guarantee that is for them never to share a code path or a cookie name.
 *
 * Same discipline as staff sessions: the cookie carries a random token, the
 * database stores only its SHA-256, and the cookie is httpOnly and sameSite.
 */

export const GUEST_COOKIE = "paltas_guest";
const SESSION_DAYS = 30;

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createGuestSession(
  guestId: string,
  meta: { ip?: string; userAgent?: string } = {},
) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.guestSession.create({
    data: { guestId, token: digest(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  });

  cookies().set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { expiresAt };
}

export interface CurrentGuest {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  country: string | null;
  locale: string | null;
}

/** The signed-in guest, or null. Expired rows are cleaned up on sight. */
export async function currentGuest(): Promise<CurrentGuest | null> {
  const token = cookies().get(GUEST_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.guestSession.findUnique({
    where: { token: digest(token) },
    include: { guest: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.guestSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // A deactivated account keeps no session.
  if (!session.guest.active) return null;

  const g = session.guest;
  return { id: g.id, email: g.email, name: g.name, phone: g.phone, country: g.country, locale: g.locale };
}

export async function destroyGuestSession(): Promise<void> {
  const token = cookies().get(GUEST_COOKIE)?.value;
  if (token) await prisma.guestSession.deleteMany({ where: { token: digest(token) } });
  cookies().delete(GUEST_COOKIE);
}

/**
 * The guest gate for booking endpoints.
 *
 * There is no permission to check — a guest may act on their own bookings and
 * nothing else — so ownership is the whole authorisation model, and every
 * handler that touches a booking must compare `guestId` rather than trusting an
 * id from the request.
 */
export async function requireGuest(): Promise<
  { ok: true; guest: CurrentGuest } | { ok: false }
> {
  const guest = await currentGuest();
  return guest ? { ok: true, guest } : { ok: false };
}
