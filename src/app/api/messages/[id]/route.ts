import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, handle, notFound, ok, unauthorized } from "@/server/http";
import {
  cleanBody, counterpart, currentParticipant, isMine, readColumn, senderColumns, threadFilter,
} from "@/server/messages";

export const dynamic = "force-dynamic";

/**
 * One conversation, and reading it marks it read.
 *
 * The thread is fetched through the participant's own filter, so a thread
 * belonging to somebody else is simply not found — the same answer an id that
 * never existed gets, which is what stops this endpoint from confirming who is
 * talking to whom.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const who = await currentParticipant();
    if (!who) return unauthorized();

    const thread = await prisma.messageThread.findFirst({
      where: { id: params.id, ...threadFilter(who) },
      select: {
        id: true, official: true, subject: true,
        guest: { select: { name: true } },
        user: { select: { name: true } },
        listing: { select: { id: true, title: true } },
        messages: {
          orderBy: { createdAt: "asc" }, take: 200,
          select: { id: true, body: true, createdAt: true, senderGuestId: true, senderUserId: true },
        },
      },
    });
    if (!thread) return notFound("That conversation was not found.");

    // Only the other side's messages are marked — marking your own would be
    // meaningless and would churn the row on every poll.
    await prisma.message.updateMany({
      where: {
        threadId: thread.id,
        [readColumn(who)]: null,
        ...(who.side === "guest" ? { senderGuestId: null } : { senderUserId: null }),
      },
      data: { [readColumn(who)]: new Date() },
    });

    return ok({
      thread: {
        id: thread.id,
        ...counterpart(thread, who),
        subject: thread.subject,
        listing: thread.listing,
        messages: thread.messages.map((message) => ({
          id: message.id,
          body: message.body,
          at: message.createdAt,
          mine: isMine(message, who),
        })),
      },
    });
  });
}

/** Reply. Same membership test as reading, for the same reason. */
export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const who = await currentParticipant();
    if (!who) return unauthorized();

    const payload = await req.json().catch(() => null) as { body?: unknown } | null;
    const body = cleanBody(payload?.body);
    if (!body) return badRequest("Write a message first.");

    const thread = await prisma.messageThread.findFirst({
      where: { id: params.id, ...threadFilter(who) },
      select: { id: true },
    });
    if (!thread) return notFound("That conversation was not found.");

    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { threadId: thread.id, body, ...senderColumns(who) },
        select: { id: true, body: true, createdAt: true },
      }),
      prisma.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } }),
    ]);

    return ok({ message: { id: message.id, body: message.body, at: message.createdAt, mine: true } }, 201);
  });
}
