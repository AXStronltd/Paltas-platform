import { prisma } from "@/server/db";
import { createTransfer, reverseTransfer } from "@/server/stripe";
import {
  planPayouts, reverseForRefund, DEFAULT_POLICY, netOf,
  type Earning, type PayoutPolicy,
} from "@/lib/payouts/ledger";

/**
 * Moving money to hosts.
 *
 * The arithmetic lives in `@/lib/payouts/ledger`, which is pure and heavily
 * tested; this file is the part that touches the database and Stripe, and it is
 * deliberately thin. Every decision about *whether* something may be paid is
 * made there. Everything here is about doing it exactly once.
 *
 * The order of operations in `runPayouts` is the whole point. A row is written
 * and the earnings are claimed *before* Stripe is called, so a crash between
 * the two leaves money unsent rather than sent twice — and the idempotency key
 * means the retry Stripe sees is recognised as the same payout rather than a
 * second one.
 */

/** How long money is held, and how little is worth sending. */
export function policy(): PayoutPolicy {
  const holdDays = Number(process.env.PAYOUT_HOLD_DAYS);
  const minimum = Number(process.env.PAYOUT_MINIMUM);
  return {
    holdDays: Number.isFinite(holdDays) && holdDays >= 0 ? holdDays : DEFAULT_POLICY.holdDays,
    minimumPayout: Number.isFinite(minimum) && minimum >= 0 ? minimum : DEFAULT_POLICY.minimumPayout,
  };
}

/**
 * Record what a booking earns its host, once the guest has actually paid.
 *
 * Idempotent on the booking: a webhook delivered twice, or a payment retried,
 * must not owe the host twice. The unique constraint on `bookingId` is the
 * guarantee; this returns quietly rather than throwing, because a duplicate
 * delivery is normal and not an error.
 */
export async function recordEarning(bookingId: string): Promise<{ created: boolean }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true, total: true, currency: true, checkOut: true,
      property: { select: { orgId: true } },
      earning: { select: { id: true } },
    },
  });
  if (!booking || booking.earning) return { created: false };

  const org = await prisma.organization.findUnique({
    where: { id: booking.property.orgId },
    select: { platformFeeBasisPoints: true },
  });

  // Rounded down, so the platform never takes more than the stated rate and the
  // rounding error always favours the host.
  const bps = org?.platformFeeBasisPoints ?? 0;
  const platformFee = Math.floor((booking.total * bps) / 10_000);

  try {
    await prisma.hostEarning.create({
      data: {
        orgId: booking.property.orgId,
        bookingId: booking.id,
        currency: booking.currency,
        gross: booking.total,
        platformFee,
        checkOut: booking.checkOut,
        status: "HELD",
      },
    });
    return { created: true };
  } catch {
    // P2002 on bookingId: another delivery of the same event won the race, which
    // is exactly what the constraint is for.
    return { created: false };
  }
}

/**
 * Undo what a booking earned, because the guest was refunded.
 *
 * Money that has already reached the host cannot be recovered by refunding the
 * guest — that only empties the platform's balance — so a paid earning is
 * clawed back through Stripe explicitly. The ledger decides which case this is.
 */
export async function reverseEarning(bookingId: string): Promise<{
  reversed: boolean; clawedBack: boolean; error: string | null;
}> {
  const earning = await prisma.hostEarning.findUnique({
    where: { bookingId },
    select: {
      id: true, status: true, currency: true, gross: true, platformFee: true,
      payout: { select: { stripeTransferId: true } },
    },
  });
  if (!earning) return { reversed: false, clawedBack: false, error: null };
  if (earning.status === "REVERSED") return { reversed: true, clawedBack: false, error: null };

  const verdict = reverseForRefund({
    id: earning.id, orgId: "", bookingId, currency: earning.currency,
    gross: earning.gross, platformFee: earning.platformFee,
    status: earning.status, checkOut: new Date(),
  });

  let clawedBack = false;
  let error: string | null = null;

  if (verdict.clawBackRequired) {
    const transferId = earning.payout?.stripeTransferId;
    if (!transferId) {
      // Marked paid with no transfer to reverse. Refusing to mark it reversed
      // keeps the discrepancy visible instead of writing it out of existence.
      return {
        reversed: false, clawedBack: false,
        error: "Earning is marked paid but carries no transfer to reverse.",
      };
    }
    const res = await reverseTransfer(transferId, netOf({
      id: earning.id, orgId: "", bookingId, currency: earning.currency,
      gross: earning.gross, platformFee: earning.platformFee,
      status: earning.status, checkOut: new Date(),
    }));
    if (!res.ok) return { reversed: false, clawedBack: false, error: res.error };
    clawedBack = true;
  }

  await prisma.hostEarning.update({
    where: { id: earning.id },
    data: { status: "REVERSED", reversedAt: new Date(), clawedBack },
  });
  return { reversed: true, clawedBack, error };
}

export interface PayoutRunResult {
  sent: { payoutId: string; orgId: string; currency: string; amount: number; earnings: number }[];
  failed: { orgId: string; currency: string; amount: number; error: string }[];
  withheld: { orgId: string; currency: string; amount: number; reason: string }[];
}

/**
 * Pay every host who is owed something and can receive it.
 *
 * Safe to run repeatedly and safe to interrupt. Each batch claims its earnings
 * in a transaction before Stripe is called; if the process dies mid-flight the
 * earnings are already marked paid against a PENDING payout, so the next run
 * will not re-send them, and the payout row is left visible for a human to
 * reconcile rather than silently retried.
 */
export async function runPayouts(opts: { now?: Date; dryRun?: boolean } = {}): Promise<PayoutRunResult> {
  const now = opts.now ?? new Date();
  const p = policy();

  const rows = await prisma.hostEarning.findMany({
    where: { status: { in: ["HELD", "PAYABLE"] } },
    select: {
      id: true, orgId: true, bookingId: true, currency: true,
      gross: true, platformFee: true, status: true, checkOut: true,
    },
  });

  const orgIds = [...new Set(rows.map((r) => r.orgId))];
  const orgs = await prisma.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, stripeAccountId: true, stripeOnboarded: true },
  });

  const plan = planPayouts({
    earnings: rows as Earning[],
    accounts: orgs.map((o) => ({
      orgId: o.id,
      stripeAccountId: o.stripeAccountId,
      // Onboarded is Stripe's own verdict, kept current by the account.* webhook.
      payoutsEnabled: o.stripeOnboarded,
    })),
    now,
    policy: p,
  });

  const result: PayoutRunResult = {
    sent: [],
    failed: [],
    withheld: plan.withheld.map((w) => ({
      orgId: w.orgId, currency: w.currency, amount: w.amount, reason: w.reason,
    })),
  };

  if (opts.dryRun) {
    for (const b of plan.batches) {
      result.sent.push({
        payoutId: "(dry run)", orgId: b.orgId, currency: b.currency,
        amount: b.amount, earnings: b.earningIds.length,
      });
    }
    return result;
  }

  for (const batch of plan.batches) {
    // Claim first. Marking the earnings against a PENDING payout before Stripe
    // is called is what makes a crash lose a payout rather than duplicate one.
    let payoutId: string;
    try {
      const payout = await prisma.$transaction(async (tx) => {
        const created = await tx.payout.create({
          data: {
            orgId: batch.orgId,
            currency: batch.currency,
            amount: batch.amount,
            idempotencyKey: batch.idempotencyKey,
            status: "PENDING",
          },
          select: { id: true },
        });
        // Only earnings still owed: if another run claimed one in between, this
        // updates fewer rows and the guard below refuses to send.
        const claimed = await tx.hostEarning.updateMany({
          where: { id: { in: batch.earningIds }, status: { in: ["HELD", "PAYABLE"] } },
          data: { status: "PAID", paidAt: new Date(), payoutId: created.id },
        });
        if (claimed.count !== batch.earningIds.length) {
          throw new Error("earnings changed underneath the run");
        }
        return created;
      });
      payoutId = payout.id;
    } catch (e) {
      // A duplicate idempotency key means this exact batch was already created
      // by a previous run — which is the retry working, not a failure.
      result.failed.push({
        orgId: batch.orgId, currency: batch.currency, amount: batch.amount,
        error: (e as Error).message,
      });
      continue;
    }

    const res = await createTransfer({
      amount: batch.amount,
      currency: batch.currency,
      destination: batch.stripeAccountId,
      idempotencyKey: batch.idempotencyKey,
      metadata: { orgId: batch.orgId, payoutId },
    });

    if (res.transferId) {
      await prisma.payout.update({
        where: { id: payoutId },
        data: { status: "SENT", stripeTransferId: res.transferId, sentAt: new Date() },
      });
      result.sent.push({
        payoutId, orgId: batch.orgId, currency: batch.currency,
        amount: batch.amount, earnings: batch.earningIds.length,
      });
    } else {
      // Stripe refused. Give the money back to the queue so the next run can
      // try again, and keep the failed payout visible with its reason.
      await prisma.$transaction([
        prisma.hostEarning.updateMany({
          where: { payoutId },
          data: { status: "PAYABLE", paidAt: null, payoutId: null },
        }),
        prisma.payout.update({
          where: { id: payoutId },
          data: { status: "FAILED", failureReason: res.error },
        }),
      ]);
      result.failed.push({
        orgId: batch.orgId, currency: batch.currency, amount: batch.amount,
        error: res.error ?? "Transfer refused.",
      });
    }
  }

  return result;
}
