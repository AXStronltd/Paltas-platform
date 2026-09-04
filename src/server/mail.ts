import { prisma } from "@/server/db";
import { afterFailure, deliverable, type Attempt } from "@/lib/mail/outbox";
import type { Rendered } from "@/lib/mail/templates";

/**
 * Sending mail, server-side only.
 *
 * Talks to Resend's REST API with `fetch` rather than pulling in an SDK, for
 * the same reason `stripe.ts` does: the dependency surface stays small and
 * every field that leaves this process is visible in one file.
 *
 * Two rules this module exists to enforce.
 *
 * The API key is read from `RESEND_API_KEY` and never leaves the server. It is
 * never logged, never returned in a response, and never interpolated into an
 * error message — including the errors written to `lastError`, which are stored
 * in the database and read by people who should not be able to read the key.
 *
 * And nothing is sent directly. Every message goes through the outbox, so the
 * decision to notify somebody is made in the same transaction as the thing
 * being notified about, and delivery is a separate, retryable step. A process
 * that dies between the two leaves a message to send, not a guest who was
 * never told.
 */

const RESEND_API = "https://api.resend.com/emails";

/**
 * Whether mail can actually be delivered.
 *
 * Deliberately does not count `SMTP_URL`. An SMTP transport is not implemented
 * here, and treating that variable as "configured" would mean a deployment that
 * silently stops issuing password-reset links while also not sending them —
 * locking people out with no error anywhere. Configuration that half-works is
 * worse than configuration that is absent.
 */
export function mailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && senderAddress());
}

/** Who mail comes from. A display name is optional; an address is not. */
export function senderAddress(): string | null {
  const from = process.env.MAIL_FROM?.trim();
  return from && from.includes("@") ? from : null;
}

/** Where links in an email should point. */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://paltas-platform.onrender.com").replace(/\/+$/, "");
}

export interface Enqueued {
  /** False when there was nothing to enqueue — no address, or a duplicate. */
  queued: boolean;
  id?: string;
}

/**
 * Record the intent to send.
 *
 * `dedupeKey` is unique, and a collision is success rather than an error: the
 * message has already been queued by an earlier delivery of the same event and
 * queueing it again is precisely what must not happen.
 */
export async function enqueue(input: {
  kind: string;
  dedupeKey: string;
  to: string;
  locale?: string | null;
  message: Rendered;
}): Promise<Enqueued> {
  if (!deliverable(input.to)) return { queued: false };

  try {
    const row = await prisma.emailMessage.create({
      data: {
        dedupeKey: input.dedupeKey,
        kind: input.kind,
        to: input.to.trim(),
        subject: input.message.subject,
        text: input.message.text,
        html: input.message.html,
        locale: input.locale ?? "en",
      },
      select: { id: true },
    });
    return { queued: true, id: row.id };
  } catch (error) {
    // P2002 is the unique constraint on dedupeKey doing its job.
    if ((error as { code?: string }).code === "P2002") return { queued: false };
    throw error;
  }
}

/** One attempt at one message. Never throws; the outcome is written down. */
async function attempt(row: {
  id: string; to: string; subject: string; text: string; html: string;
  attempts: number; status: string;
}, now: Date): Promise<"sent" | "retry" | "failed"> {
  const key = process.env.RESEND_API_KEY;
  const from = senderAddress();
  if (!key || !from) return "retry";

  let status = 0;
  let providerId: string | null = null;
  let detail = "";

  try {
    const response = await fetch(RESEND_API, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from, to: [row.to], subject: row.subject, text: row.text, html: row.html,
      }),
    });
    status = response.status;
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    providerId = body.id ?? null;
    // The provider's message, never our request: the Authorization header is in
    // the request and `lastError` is stored and read by people.
    detail = String(body.message ?? "").slice(0, 300);
  } catch (error) {
    // A network failure is transient by definition — nothing was refused.
    status = 0;
    detail = error instanceof Error ? error.name : "network error";
  }

  if (status >= 200 && status < 300) {
    await prisma.emailMessage.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: now, providerId, attempts: row.attempts + 1, lastError: null },
    });
    return "sent";
  }

  const next = afterFailure({ attempts: row.attempts, status: "PENDING" } as Attempt, status || 503, now);
  await prisma.emailMessage.update({
    where: { id: row.id },
    data: {
      status: next.status,
      attempts: next.attempts,
      nextAttemptAt: next.nextAttemptAt,
      lastError: `${status || "network"}: ${detail}`.slice(0, 300),
    },
  });
  return next.status === "FAILED" ? "failed" : "retry";
}

/**
 * Send what is due.
 *
 * Ordered oldest first so a backlog drains in the order it accumulated: the
 * guest who booked an hour ago should not wait behind the one who booked a
 * minute ago because the newer row sorted first.
 */
export async function flush(limit = 25, now = new Date()): Promise<{
  sent: number; retry: number; failed: number; pending: number;
}> {
  const due = await prisma.emailMessage.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
    select: { id: true, to: true, subject: true, text: true, html: true, attempts: true, status: true },
  });

  let sent = 0, retry = 0, failed = 0;
  for (const row of due) {
    const outcome = await attempt(row, now);
    if (outcome === "sent") sent += 1;
    else if (outcome === "failed") failed += 1;
    else retry += 1;
  }

  const pending = await prisma.emailMessage.count({ where: { status: "PENDING" } });
  return { sent, retry, failed, pending };
}

/**
 * Queue a message and try it immediately, without making the caller wait.
 *
 * The booking is already confirmed by the time this runs; a slow mail provider
 * must not hold up the response that tells the guest so. If the immediate
 * attempt fails the row stays PENDING and `flush` picks it up later, which is
 * the whole point of there being a row.
 */
export async function enqueueAndSend(input: Parameters<typeof enqueue>[0]): Promise<void> {
  const result = await enqueue(input);
  if (!result.queued || !mailEnabled()) return;
  void flush(1).catch(() => {
    /* Written down in the row; nothing useful to do here and nothing to log
       that lastError does not already say. */
  });
}
