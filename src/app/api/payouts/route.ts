import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guard, handle, ok } from "@/server/http";
import { PERMISSIONS } from "@/lib/security/permissions";
import { balances, payableFrom, netOf, type Earning } from "@/lib/payouts/ledger";
import { policy } from "@/server/payouts";

export const dynamic = "force-dynamic";

/**
 * What this organisation is owed, and what it has been sent.
 *
 * The question every host asks first, and the one a marketplace has no excuse
 * for being unable to answer: how much, in what currency, and when. Scoped to
 * the caller's own organisation — a payout statement is about as private as a
 * record gets — and behind the same finance permission as the rest of the money.
 *
 * Held earnings state the date they become payable rather than a vague "soon",
 * because "when" is the actual question.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guard(PERMISSIONS.FINANCE_VIEW);
    if ("response" in g) return g.response;

    const rows = await prisma.hostEarning.findMany({
      where: { orgId: g.actor.orgId },
      orderBy: { checkOut: "desc" },
      take: 200,
      select: {
        id: true, orgId: true, bookingId: true, currency: true,
        gross: true, platformFee: true, status: true, checkOut: true,
        paidAt: true, clawedBack: true,
        booking: { select: { reference: true } },
      },
    });

    const p = policy();
    const org = await prisma.organization.findUnique({
      where: { id: g.actor.orgId },
      select: { stripeAccountId: true, stripeOnboarded: true },
    });

    const payouts = await prisma.payout.findMany({
      where: { orgId: g.actor.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, currency: true, amount: true, status: true,
        sentAt: true, failureReason: true, createdAt: true,
      },
    });

    return ok({
      /*
       * Stated plainly, because a host with money held and no connected account
       * is owed an explanation rather than silence. `payoutsEnabled` is Stripe's
       * verdict, not ours.
       */
      account: {
        connected: Boolean(org?.stripeAccountId),
        payoutsEnabled: Boolean(org?.stripeOnboarded),
      },
      policy: p,
      balances: balances(rows as Earning[]),
      earnings: rows.map((e) => ({
        bookingReference: e.booking?.reference ?? null,
        currency: e.currency,
        gross: e.gross,
        platformFee: e.platformFee,
        net: netOf(e as Earning),
        status: e.status,
        checkOut: e.checkOut,
        // "When" is the question; a date answers it and "soon" does not.
        payableFrom: e.status === "HELD" ? payableFrom(e as Earning, p) : null,
        paidAt: e.paidAt,
        clawedBack: e.clawedBack,
      })),
      payouts,
    });
  });
}
