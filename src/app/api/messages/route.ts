import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, handle, ok, unauthorized } from "@/server/http";
import {
  cleanBody, counterpart, currentParticipant, ensureSupportThread, threadFilter, unreadWhere,
} from "@/server/messages";

export const dynamic = "force-dynamic";

/** The inbox: every thread this participant is part of, newest first. */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const who = await currentParticipant();
    if (!who) return unauthorized();

    const threads = await prisma.messageThread.findMany({
      where: threadFilter(who),
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      select: {
        id: true, official: true, subject: true, lastMessageAt: true,
        guest: { select: { name: true } },
        user: { select: { name: true } },
        listing: { select: { id: true, title: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, createdAt: true } },
      },
    });

    // One grouped count rather than a query per thread — an inbox with fifty
    // conversations should not be fifty round trips.
    const counts = await prisma.message.groupBy({
      by: ["threadId"],
      where: { threadId: { in: threads.map((t) => t.id) }, ...unreadWhere(who) },
      _count: { _all: true },
    });
    const unreadFor = new Map(counts.map((c) => [c.threadId, c._count._all]));

    return ok({
      threads: threads.map((thread) => ({
        id: thread.id,
        ...counterpart(thread, who),
        subject: thread.subject,
        listing: thread.listing,
        preview: thread.messages[0]?.body ?? "",
        lastMessageAt: thread.lastMessageAt,
        unread: unreadFor.get(thread.id) ?? 0,
      })),
    });
  });
}

/**
 * Start a conversation, or return the one that already exists.
 *
 * Guests only: a host does not cold-message somebody who has not contacted
 * them, and making that impossible here is cheaper than moderating it later.
 * Asking twice is safe — the same pair and listing resolve to the same thread
 * rather than a second one, which is what stops a double-clicked button from
 * splitting a conversation in half.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const who = await currentParticipant();
    if (!who) return unauthorized();
    if (who.side !== "guest") return fail(403, { code: "forbidden", message: "Only guests can open a new conversation." });

    const body = await req.json().catch(() => null) as { listingId?: string; support?: boolean; body?: unknown } | null;

    if (body?.support || !body?.listingId) {
      const id = await ensureSupportThread(who.id);
      if (body?.body !== undefined) {
        const text = cleanBody(body.body);
        if (!text) return badRequest("Write a message first.");
        await prisma.$transaction([
          prisma.message.create({ data: { threadId: id, body: text, senderGuestId: who.id, readByGuestAt: new Date() } }),
          prisma.messageThread.update({ where: { id }, data: { lastMessageAt: new Date() } }),
        ]);
      }
      return ok({ threadId: id }, 201);
    }

    // The host is derived from the listing, never taken from the request. A
    // client that could name the recipient could message anybody on the platform.
    const listing = await prisma.propertyListing.findUnique({
      where: { id: body.listingId },
      select: { id: true, orgId: true, status: true, org: { select: { users: { where: { isOwner: true, status: "ACTIVE" }, take: 1, select: { id: true } } } } },
    });
    if (!listing || listing.status !== "PUBLISHED") {
      return fail(404, { code: "not_found", message: "That listing was not found." });
    }
    const hostId = listing.org.users[0]?.id ?? null;
    if (!hostId) return fail(409, { code: "no_host", message: "This listing has no host to contact yet." });

    const existing = await prisma.messageThread.findFirst({
      where: { guestId: who.id, userId: hostId, listingId: listing.id },
      select: { id: true },
    });
    const threadId = existing?.id ?? (await prisma.messageThread.create({
      data: { guestId: who.id, userId: hostId, orgId: listing.orgId, listingId: listing.id },
      select: { id: true },
    })).id;

    if (body.body !== undefined) {
      const text = cleanBody(body.body);
      if (!text) return badRequest("Write a message first.");
      await prisma.$transaction([
        prisma.message.create({ data: { threadId, body: text, senderGuestId: who.id, readByGuestAt: new Date() } }),
        prisma.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
      ]);
    }

    return ok({ threadId }, existing ? 200 : 201);
  });
}
