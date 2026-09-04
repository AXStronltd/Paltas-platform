/**
 * Outbox policy: what to send again, when, and when to stop.
 *
 * Pure. No database, no clock of its own, no provider — every decision here is
 * a function of values passed in, so the awkward cases (a provider that keeps
 * timing out, an address that will never accept mail) can be tested without
 * anything being sent anywhere.
 *
 * The distinction that matters is transient versus permanent. A 500 from the
 * provider means try again; a 422 saying the address is malformed means the
 * message will never be delivered however many times it is offered, and
 * retrying it forever costs money and hides the real failures behind it.
 */

/** How many times a message is offered to the provider before it is given up on. */
export const MAX_ATTEMPTS = 6;

/**
 * Backoff between attempts, in seconds: about a minute, then five, then twenty,
 * an hour, four hours, and a day. A provider having a bad ten minutes is
 * ridden out; one that has been broken since yesterday is not hammered.
 */
export const BACKOFF_SECONDS = [60, 300, 1_200, 3_600, 14_400, 86_400];

export interface Attempt {
  attempts: number;
  status: "PENDING" | "SENT" | "FAILED";
}

/** When a message that has just failed its Nth attempt should next be tried. */
export function nextAttemptAt(attempts: number, now: Date): Date {
  const seconds = BACKOFF_SECONDS[Math.min(attempts, BACKOFF_SECONDS.length - 1)];
  return new Date(now.getTime() + seconds * 1_000);
}

/**
 * Whether a provider response is worth trying again.
 *
 * Unknown statuses are treated as transient. Getting this wrong in the
 * permanent direction throws away a message that would have been delivered;
 * getting it wrong in the transient direction costs six attempts and then
 * stops. The cheaper mistake is the one to make.
 */
export function isPermanent(httpStatus: number): boolean {
  if (httpStatus === 401 || httpStatus === 403) return false; // our key, fixable
  if (httpStatus === 429) return false;                       // rate limited
  return httpStatus >= 400 && httpStatus < 500;
}

/** What a failed attempt should leave behind. */
export function afterFailure(
  attempt: Attempt,
  httpStatus: number,
  now: Date,
): { status: "PENDING" | "FAILED"; attempts: number; nextAttemptAt: Date } {
  const attempts = attempt.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const permanent = isPermanent(httpStatus);
  return {
    status: permanent || exhausted ? "FAILED" : "PENDING",
    attempts,
    nextAttemptAt: nextAttemptAt(attempts, now),
  };
}

/**
 * The key that makes a send happen once.
 *
 * Built from the thing that happened, never from the time it was noticed. A
 * webhook delivered three times describes one event and must produce one key.
 */
export function dedupeKey(kind: string, subjectId: string, discriminator?: string): string {
  return [kind, subjectId, discriminator].filter(Boolean).join(":");
}

/**
 * An address the provider will plainly refuse is not worth a row in the outbox,
 * a network call, and six retries. This is a sanity check and not an attempt to
 * validate email addresses properly, which cannot be done by pattern.
 */
export function deliverable(address: string | null | undefined): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  if (trimmed.length < 6 || trimmed.length > 254) return false;
  if (/\s/.test(trimmed)) return false;
  const at = trimmed.indexOf("@");
  if (at < 1 || at !== trimmed.lastIndexOf("@")) return false;
  const domain = trimmed.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}
