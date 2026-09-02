import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { handle } from "@/server/http";
import { mapStatus, verifyWebhookSignature } from "@/server/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe's webhook.
 *
 * Unauthenticated in the session sense — Stripe has no cookie — but *not*
 * unauthorised: the signature is verified against the endpoint secret before a
 * single byte of the payload is believed. An unverified webhook is a stranger
 * asserting that a payment succeeded, and treating it as authoritative is how
 * goods get shipped for free.
 *
 * The raw body is read as text on purpose. Parsing and re-serialising the JSON
 * changes the bytes and the signature will not match.
 *
 * Webhooks arrive more than once, out of order, and sometimes for intents this
 * system has never heard of. All three are handled: writes key on Stripe's own
 * intent id, and an unknown intent is recorded rather than dropped, because a
 * payment we cannot explain is exactly the one worth keeping.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const raw = await req.text();
    const verdict = verifyWebhookSignature(
      raw,
      req.headers.get("stripe-signature"),
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    if (!verdict.ok) {
      // Deliberately terse: an attacker probing the endpoint learns nothing.
      console.warn("[stripe webhook] rejected:", verdict.reason);
      return NextResponse.json({ error: "invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(raw) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };

    // Connect: Stripe tells us when an owner finishes onboarding, or when a
    // requirement later puts them back out of action. Both directions matter —
    // an account that stops being able to take charges must stop being routed to.
    if (event.type.startsWith("account.")) {
      const account = event.data.object as { id?: string; charges_enabled?: boolean };
      if (account.id) {
        await prisma.organization.updateMany({
          where: { stripeAccountId: account.id },
          data: { stripeOnboarded: account.charges_enabled === true },
        });
      }
      return NextResponse.json({ received: true });
    }

    const intent = event.data.object as {
      id?: string; amount?: number; currency?: string; status?: string;
      last_payment_error?: { message?: string };
      metadata?: Record<string, string>;
    };
    if (!intent.id) return NextResponse.json({ received: true });

    const status = event.type === "charge.refunded"
      ? "REFUNDED" as const
      : mapStatus(intent.status ?? "");

    const record = await prisma.paymentIntentRecord.upsert({
      where: { stripeIntentId: intent.id },
      create: {
        stripeIntentId: intent.id,
        orgId: intent.metadata?.orgId ?? null,
        amount: intent.amount ?? 0,
        currency: (intent.currency ?? "kes").toUpperCase(),
        status,
        purpose: intent.metadata?.purpose ?? "unknown",
        reference: intent.metadata?.reference ?? null,
        chargeId: intent.metadata?.chargeId ?? null,
        groupBookingId: intent.metadata?.groupBookingId ?? null,
        failureReason: intent.last_payment_error?.message ?? null,
        lastEvent: event as never,
      },
      update: {
        status,
        failureReason: intent.last_payment_error?.message ?? null,
        lastEvent: event as never,
      },
    });

    // On success, settle whatever this payment was for. Guarded so a duplicate
    // delivery of the same event cannot post the money twice.
    if (status === "SUCCEEDED") {
      if (record.chargeId) {
        const already = await prisma.payment.findFirst({
          where: { chargeId: record.chargeId, reference: intent.id },
          select: { id: true },
        });
        if (!already) {
          const charge = await prisma.charge.findUnique({
            where: { id: record.chargeId },
            include: { payments: { select: { amount: true, status: true } } },
          });
          if (charge) {
            await prisma.payment.create({
              data: {
                propertyId: charge.propertyId,
                unitId: charge.unitId,
                residentId: charge.residentId,
                chargeId: charge.id,
                kind: "SERVICE_CHARGE",
                amount: record.amount,
                currency: charge.currency,
                dueDate: charge.dueDate,
                paidAt: new Date(),
                status: "PAID",
                reference: intent.id,
              },
            });
            const settled =
              charge.payments.filter((p) => p.status === "PAID").reduce((a, p) => a + p.amount, 0) + record.amount;
            await prisma.charge.update({
              where: { id: charge.id },
              data: { status: settled >= charge.amount ? "PAID" : "PART_PAID" },
            });
          }
        }
      }

      const memberId = intent.metadata?.memberId;
      if (memberId) {
        await prisma.groupMember.updateMany({
          // The status guard is the idempotency: a repeat delivery updates nothing.
          where: { id: memberId, shareStatus: "PENDING" },
          data: { shareStatus: "PAID", paidAt: new Date(), reference: intent.id },
        });
      }
    }

    return NextResponse.json({ received: true });
  });
}
