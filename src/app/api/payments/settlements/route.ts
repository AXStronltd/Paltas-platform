import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { stripeMode } from "@/server/stripe";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/** What the payment provider actually confirmed, as opposed to what we asked for. */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardList(PERMISSIONS.PAYMENT_SETTLEMENT_VIEW);
    if (!g.ok) return g.response;

    const records = await prisma.paymentIntentRecord.findMany({
      where: g.access.kind === "platform" ? {} : { orgId: g.actor.orgId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return ok({
      mode: stripeMode(),
      settlements: records.map((r) => ({
        id: r.id,
        // Stripe's id is safe to show a finance user; the key is not, and is not here.
        stripeIntentId: r.stripeIntentId,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        purpose: r.purpose,
        reference: r.reference,
        customerEmail: r.customerEmail,
        failureReason: r.failureReason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      totals: {
        succeeded: records.filter((r) => r.status === "SUCCEEDED").reduce((a, r) => a + r.amount, 0),
        pending: records.filter((r) => r.status === "PROCESSING" || r.status === "REQUIRES_PAYMENT").reduce((a, r) => a + r.amount, 0),
        failed: records.filter((r) => r.status === "FAILED").length,
      },
    });
  });
}
