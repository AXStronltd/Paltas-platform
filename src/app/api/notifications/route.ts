import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle, ok, unauthorized } from "@/server/http";
import { currentParticipant } from "@/server/messages";

export const dynamic = "force-dynamic";

/**
 * What has happened that concerns you.
 *
 * Addressed to one recipient, always — this endpoint has no broadcast to
 * return. What everyone can see (newly published listings) is read from the
 * listings themselves by the What's New section, which needs no rows and
 * cannot go stale.
 *
 * Recipient resolution is currentParticipant(), the same helper messaging uses,
 * so a guest and a staff member are told apart once rather than twice.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const who = await currentParticipant();
    if (!who) return unauthorized();
    const mine = who.side === "guest" ? { guestId: who.id } : { userId: who.id };

    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: mine, orderBy: { createdAt: "desc" }, take: 30,
        select: { id: true, kind: true, title: true, body: true, href: true, readAt: true, createdAt: true },
      }),
      prisma.notification.count({ where: { ...mine, readAt: null } }),
    ]);

    return ok({ notifications: items, unread });
  });
}

/**
 * Mark as read — one, or everything.
 *
 * A POST rather than a PATCH on each row: opening the panel marks the lot, and
 * thirty requests to clear one badge is thirty requests.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const who = await currentParticipant();
    if (!who) return unauthorized();
    const mine = who.side === "guest" ? { guestId: who.id } : { userId: who.id };
    const body = await req.json().catch(() => null) as { id?: string } | null;

    // Scoped to the caller's own rows, so an id belonging to somebody else
    // updates nothing rather than being refused informatively.
    const { count } = await prisma.notification.updateMany({
      where: { ...mine, readAt: null, ...(body?.id ? { id: body.id } : {}) },
      data: { readAt: new Date() },
    });
    return ok({ read: count });
  });
}
