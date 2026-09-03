import { NextResponse } from "next/server";
import { guardPlatform, handle, ok, fail } from "@/server/http";
import { runPayouts, policy } from "@/server/payouts";
import { writeAudit } from "@/server/audit";
import { stripeEnabled } from "@/server/stripe";

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
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardPlatform("platform.payouts");
    if ("response" in g) return g.response;

    if (!stripeEnabled()) {
      return fail(503, { code: "unavailable", message: "Payments are not configured yet." });
    }

    const dryRun = new URL(req.url).searchParams.get("dry") === "1";
    const result = await runPayouts({ dryRun });

    // Money moving is exactly the kind of thing the audit trail exists for, and
    // a preview is worth recording too: it says who was looking at what was owed.
    await writeAudit({
      actor: g.actor,
      action: dryRun ? "payout.run.preview" : "payout.run",
      entityType: "Payout",
      summary: dryRun
        ? `Previewed ${result.sent.length} payout(s)`
        : `Sent ${result.sent.length}, failed ${result.failed.length}, withheld ${result.withheld.length}`,
      after: { sent: result.sent.length, failed: result.failed.length, withheld: result.withheld.length },
    });

    return ok({ dryRun, policy: policy(), ...result });
  });
}
