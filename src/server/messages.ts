import { prisma } from "./db";
import { currentGuest } from "./guest";
import { currentActor } from "./actor";

/**
 * Who is reading the inbox.
 *
 * The two sides of PALTAS are separate all the way down — different tables,
 * different cookies, different endpoints — and messaging is the first feature
 * that has to span them. Rather than blur that, a caller is resolved to one
 * side or the other here, once, and every route below reasons about the result
 * instead of asking twice and possibly disagreeing.
 *
 * A guest cookie wins when both are present. Someone browsing the marketplace
 * while also holding a staff account is, on the marketplace, a guest.
 */
export type Participant =
  | { side: "guest"; id: string; name: string }
  | { side: "user"; id: string; name: string; orgId: string; isPlatformAdmin: boolean };

export async function currentParticipant(): Promise<Participant | null> {
  const guest = await currentGuest();
  if (guest) return { side: "guest", id: guest.id, name: guest.name };
  const actor = await currentActor();
  if (!actor) return null;
  // A staff account that has not been activated yet has no business reading
  // anybody's correspondence, for the same reason it cannot read anything else.
  if (actor.status !== "ACTIVE") return null;
  return { side: "user", id: actor.id, name: actor.name, orgId: actor.orgId, isPlatformAdmin: actor.isPlatformAdmin };
}

/**
 * The threads this participant may see.
 *
 * Expressed as a Prisma filter rather than a check after the fact, so a thread
 * they are not part of is never loaded and cannot be leaked by a mistake
 * further down. Platform staff additionally see every official thread, because
 * "PALTAS Support" is a desk rather than a person and somebody has to answer it.
 */
export function threadFilter(who: Participant) {
  if (who.side === "guest") return { guestId: who.id };
  return who.isPlatformAdmin
    ? { OR: [{ userId: who.id }, { official: true }] }
    : { userId: who.id };
}

/** Which read-receipt column belongs to this side. */
export function readColumn(who: Participant): "readByGuestAt" | "readByUserAt" {
  return who.side === "guest" ? "readByGuestAt" : "readByUserAt";
}

/** The sender columns for a message this participant writes. */
export function senderColumns(who: Participant) {
  return who.side === "guest"
    ? { senderGuestId: who.id, readByGuestAt: new Date() }
    : { senderUserId: who.id, readByUserAt: new Date() };
}

/** Was this message written by the person reading it? */
export function isMine(
  message: { senderGuestId: string | null; senderUserId: string | null },
  who: Participant,
): boolean {
  return who.side === "guest" ? message.senderGuestId === who.id : message.senderUserId === who.id;
}

/** How many messages in this thread the participant has not yet read. */
export function unreadWhere(who: Participant) {
  return who.side === "guest"
    ? { readByGuestAt: null, senderGuestId: null }
    : { readByUserAt: null, senderUserId: null };
}

/**
 * The name and initials the other side should be shown under.
 *
 * An official thread is PALTAS itself; a host thread is whoever is not reading
 * it. Computed here so the two routes that need it cannot drift.
 */
export function counterpart(
  thread: { official: boolean; guest: { name: string } | null; user: { name: string } | null },
  who: Participant,
): { name: string; initials: string; official: boolean } {
  const name = thread.official && who.side === "guest"
    ? "PALTAS Support"
    : who.side === "guest"
      ? thread.user?.name ?? "PALTAS Support"
      : thread.guest?.name ?? "Guest";
  return { name, initials: initialsOf(name), official: thread.official };
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Bodies are trimmed, capped and never empty. */
export const MAX_BODY = 4000;

export function cleanBody(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const body = input.trim();
  if (!body || body.length > MAX_BODY) return null;
  return body;
}

/** Ensure the guest's single PALTAS Support thread exists, and return it. */
export async function ensureSupportThread(guestId: string): Promise<string> {
  const existing = await prisma.messageThread.findFirst({ where: { guestId, official: true }, select: { id: true } });
  if (existing) return existing.id;
  const thread = await prisma.messageThread.create({
    data: { guestId, official: true, subject: "PALTAS Support" },
    select: { id: true },
  });
  await prisma.message.create({
    data: {
      threadId: thread.id,
      body: "Hi! PALTAS Support here. Ask us anything about your bookings, payments or your account.",
      readByUserAt: new Date(),
    },
  });
  return thread.id;
}
