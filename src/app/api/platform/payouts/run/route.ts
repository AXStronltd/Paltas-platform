import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { guardPlatform, handle, ok, fail } from "@/server/http";
import { runPayouts, policy } from "@/server/payouts";
import { writeAudit } from "@/server/audit";
import { stripeEnabled } from "@/server/stripe";
import { SCHEDULER } from "@/server/scheduler";

export const dynamic = "force-dynamic";

/**
 * Pay every host who is owed something and can receive it.
 *
 * Paltas staff only, behind guardPlatform, which answers 404 rather than 403 —
 * a stranger should not learn that a payout endpoint exists, let alone probe it.
 *
 * `?dry=1` plans without moving anything, which is how you check a run before
 * making it. The run itself is safe to repeat: the ledger derives each batch's
 * idempotency key from the earnings it pays, so a retry after a crash is
 * recognised by Stripe as the same transfer rather than a second one.
 */

/**
 * Whether this request carries the scheduler's own credential.
 *
 * A cron has no session, so it presents a shared secret instead. Three things
 * make that safe enough to move money with:
 *
 *  - It fails closed. With `PAYOUT_RUN_TOKEN` unset there is no token path at
 *    all, rather than an empty expectation any caller could satisfy. A short
 *    token is treated as unset for the same reason.
 *  - The comparison is timing-safe, with the length checked first because
 *    `timingSafeEqual` throws on unequal lengths rather than returning false.
 *  - It unlocks this one endpoint and nothing else. It is not a session, it
 *    carries no permissions, and it cannot read a single row.
 */
function isScheduledRun(req: Request): boolean {
  const expected = process.env.PAYOUT_RUN_TOKEN;
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
    // A person still has to be Paltas staff. The token speaks only for the
    // scheduler, and stands in for nobody.
    const g = scheduled ? null : await guardPlatform("platform.payouts");
    if (g && "response" in g) return g.response;

    if (!stripeEnabled()) {
      return fail(503, { code: "unavailable", message: "Payments are not configured yet." });
    }

    const dryRun = new URL(req.url).searchParams.get("dry") === "1";
    const result = await runPayouts({ dryRun });

    // Money moving is exactly the kind of thing the audit trail exists for, and
    // a preview is worth recording too: it says who was looking at what was owed.
    await writeAudit({
      // A scheduled run is not a person. Recording it as one would put a name
      // against money nobody chose to move.
      actor: g ? g.actor : SCHEDULER,
      action: scheduled ? "payout.run.scheduled" : dryRun ? "payout.run.preview" : "payout.run",
      entityType: "Payout",
      summary: dryRun
        ? `Previewed ${result.sent.length} payout(s)`
        : `Sent ${result.sent.length}, failed ${result.failed.length}, withheld ${result.withheld.length}`,
      after: { sent: result.sent.length, failed: result.failed.length, withheld: result.withheld.length },
    });

    return ok({ dryRun, policy: policy(), ...result });
  });
}
