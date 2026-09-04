import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { notifyBookingConfirmed } from "@/server/notifications";
import { recordEarning, reverseEarning } from "@/server/payouts";
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
        bookingId: intent.metadata?.bookingId ?? null,
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

      // A guest paying for their own stay. This is where a booking actually
      // becomes confirmed — not when the browser reaches the success screen,
      // which the guest can close, lose signal on, or never see at all.
      const bookingId = record.bookingId ?? intent.metadata?.bookingId ?? null;
      if (bookingId) {
        const confirmed = await prisma.booking.updateMany({
          // PENDING is the idempotency guard: a repeat delivery updates nothing,
          // and a booking cancelled in the meantime is not silently revived.
          where: { id: bookingId, status: "PENDING" },
          data: { status: "CONFIRMED", confirmedAt: new Date(), stripeIntentId: intent.id },
        });
        if (confirmed.count > 0) {
          await prisma.bookingEvent.create({
            data: { bookingId, status: "CONFIRMED", note: "Payment received.", actor: "system" },
          });
        }
        /*
         * What the host has earned, recorded now the guest has actually paid.
         * Outside the `confirmed.count` guard on purpose: a booking confirmed
         * by one delivery and a duplicate delivery arriving later must still
         * end with exactly one earning, and the unique constraint on bookingId
         * — not this branch — is what guarantees that.
         *
         * The money is not sent yet. It is held until the stay has finished,
         * so there is something to refund from if the property is not what was
         * advertised.
         */
        await recordEarning(bookingId);

        // Outside the `confirmed.count` guard for the same reason as the line
        // above: one event, however many times Stripe describes it, must
        // produce one email. The unique dedupe key is what enforces that.
        await notifyBookingConfirmed(bookingId);
      }
    }

    // Refunded: the host stops being owed, and if they have already been paid
    // the transfer is reversed. Refunding the guest alone would just empty the
    // platform's balance while the host kept their share.
    if (status === "REFUNDED") {
      const bookingId = record.bookingId ?? intent.metadata?.bookingId ?? null;
      if (bookingId) {
        const { reversed, clawedBack, error } = await reverseEarning(bookingId);
        if (reversed) {
          await prisma.bookingEvent.create({
            data: {
              bookingId, status: "CANCELLED", actor: "system",
              note: clawedBack
                ? "Refunded; the payout to the host was reversed."
                : "Refunded before payout; nothing was sent to the host.",
            },
          });
        } else if (error) {
          // Left visible rather than swallowed: a refund that could not be
          // recovered from the host is money the platform is now out of pocket.
          await prisma.bookingEvent.create({
            data: { bookingId, status: "CANCELLED", actor: "system", note: `Refund needs review: ${error}` },
          });
        }
      }
    }

    // A failed payment leaves the booking PENDING — it is not cancelled, so the
    // guest can try again with another card and keep the room they chose. The
    // attempt is recorded either way, so the timeline shows what happened.
    if (status === "FAILED") {
      const bookingId = record.bookingId ?? intent.metadata?.bookingId ?? null;
      if (bookingId) {
        const already = await prisma.bookingEvent.findFirst({
          where: { bookingId, note: { startsWith: "Payment failed" }, status: "PENDING" },
          orderBy: { at: "desc" },
          select: { at: true },
        });
        // Stripe retries deliveries; one failure should not become five events.
        const recent = already && Date.now() - already.at.getTime() < 60_000;
        if (!recent) {
          await prisma.bookingEvent.create({
            data: {
              bookingId,
              status: "PENDING",
              note: `Payment failed${intent.last_payment_error?.message ? `: ${intent.last_payment_error.message}` : "."}`,
              actor: "system",
            },
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  });
}
