import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardPlatform, handle, ok } from "@/server/http";
import { flush, mailEnabled, senderAddress } from "@/server/mail";
import { writeAudit } from "@/server/audit";
import { SCHEDULER } from "@/server/scheduler";

export const dynamic = "force-dynamic";

/**
 * Send what the outbox is holding.
 *
 * Most messages go out the moment they are queued. This exists for the ones
 * that did not: the provider was down, the process died between writing the row
 * and the network call, the API key was wrong for an hour. Point a scheduler at
 * it every few minutes and a bad afternoon becomes a delay rather than a guest
 * who was never told their booking was confirmed.
 *
 * Paltas staff only, behind guardPlatform, which answers 404 rather than 403 —
 * a stranger has no business learning that this endpoint exists. A scheduler
 * has no session, so it presents a shared secret instead, exactly as the payout
 * run does: fails closed when unset, compared timing-safely, and unlocking this
 * one endpoint and nothing else.
 */
function isScheduledRun(req: Request): boolean {
  const expected = process.env.MAIL_FLUSH_TOKEN;
  if (!expected || expected.length < 32) return false;

  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const scheduled = isScheduledRun(req);
    const g = scheduled ? null : await guardPlatform("platform.payouts");
    if (g && "response" in g) return g.response;

    // Not a 503. A deployment with no provider still has an outbox worth
    // reporting on, and "nothing was sent because nothing can be" is a more
    // useful answer than a refusal.
    if (!mailEnabled()) {
      const pending = await prisma.emailMessage.count({ where: { status: "PENDING" } });
      return ok({ configured: false, sender: senderAddress(), sent: 0, retry: 0, failed: 0, pending });
    }

    const result = await flush(50);

    // Sending on someone else's behalf is worth a record. The outbox rows say
    // what was sent; this says who caused the sending — and a scheduled run is
    // recorded as the scheduler rather than as whoever configured it.
    await writeAudit({
      actor: g ? g.actor : SCHEDULER,
      action: scheduled ? "mail.flush.scheduled" : "mail.flush",
      entityType: "EmailMessage",
      summary: `Sent ${result.sent}, retrying ${result.retry}, gave up on ${result.failed}`,
      after: result,
    });

    return ok({ configured: true, sender: senderAddress(), ...result });
  });
}
