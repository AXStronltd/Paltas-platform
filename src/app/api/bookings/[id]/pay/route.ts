import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { fail, handle, ok } from "@/server/http";
import { requireGuest } from "@/server/guest";
import { createPaymentIntent, stripeEnabled, stripeMode } from "@/server/stripe";

export const dynamic = "force-dynamic";

/**
 * Pay for your own booking.
 *
 * The staff payment endpoint is no use to a guest — it is behind
 * `payment.intent.create`, and a guest holds no permissions at all. So this is
 * the guest's own path, authorised by owning the booking rather than by a grant.
 *
 * It follows the same rule as every other payment route here: **the browser
 * never names a price.** The caller names a booking; the amount comes from the
 * row. A client that can set its own price will eventually be asked to.
 *
 * Only the `clientSecret` is returned — what Stripe.js needs, and all it needs.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const auth = await requireGuest();
    if (!auth.ok) return fail(401, { code: "unauthenticated", message: "Sign in to pay." });

    // Ownership is part of the query, so there is no path where the booking is
    // loaded and the check is forgotten.
    const booking = await prisma.booking.findFirst({
      where: { id: params.id, guestId: auth.guest.id },
      select: {
        id: true, reference: true, total: true, currency: true, status: true,
        stripeIntentId: true, nights: true,
        property: { select: { name: true, orgId: true } },
        listing: { select: { title: true } },
      },
    });
    if (!booking) return fail(404, { code: "not_found", message: "Booking not found." });

    if (booking.status !== "PENDING") {
      // Paying twice for the same stay is the failure worth preventing here.
      return fail(409, {
        code: "conflict",
        message: booking.status === "CANCELLED"
          ? "That booking was cancelled."
          : "That booking has already been paid for.",
      });
    }

    // Checked after authorisation and after ownership, so an unauthorised
    // caller learns nothing about how this platform takes money.
    if (!stripeEnabled()) {
      return fail(503, { code: "unavailable", message: "Card payments are not configured yet." });
    }

    const org = await prisma.organization.findUnique({
      where: { id: booking.property.orgId },
      select: { stripeAccountId: true, stripeOnboarded: true, platformFeeBasisPoints: true },
    });

    const { intent, error } = await createPaymentIntent({
      amount: booking.total,
      currency: booking.currency,
      description: `${booking.listing?.title ?? booking.property.name} · ${booking.nights} nights · ${booking.reference}`,
      // Stripe deduplicates on this, so a retried tap reuses the same intent
      // rather than creating a second one against the same booking.
      idempotencyKey: `booking_${booking.id}`,
      customerEmail: auth.guest.email,
      metadata: {
        purpose: "booking",
        bookingId: booking.id,
        reference: booking.reference,
        orgId: booking.property.orgId,
      },
      // Only route to the owner once they have actually onboarded; otherwise
      // the charge would fail rather than fall back to the platform.
      routing: org?.stripeAccountId && org.stripeOnboarded
        ? {
            destinationAccountId: org.stripeAccountId,
            platformFeeBasisPoints: org.platformFeeBasisPoints ?? 0,
          }
        : undefined,
    });

    if (!intent || error) {
      return fail(502, { code: "payment_failed", message: error ?? "The payment provider did not respond." });
    }

    await prisma.$transaction([
      prisma.booking.update({ where: { id: booking.id }, data: { stripeIntentId: intent.id } }),
      prisma.paymentIntentRecord.upsert({
        where: { stripeIntentId: intent.id },
        create: {
          stripeIntentId: intent.id,
          orgId: booking.property.orgId,
          amount: booking.total,
          currency: booking.currency,
          purpose: "booking",
          reference: booking.reference,
          bookingId: booking.id,
          customerEmail: auth.guest.email,
        },
        update: { bookingId: booking.id },
      }),
      prisma.bookingEvent.create({
        data: {
          bookingId: booking.id,
          status: "PENDING",
          note: "Payment started.",
          actor: "guest",
          actorId: auth.guest.id,
        },
      }),
    ]);

    // The webhook is the authority on whether this succeeded — not the screen
    // the guest is about to see.
    return ok({ clientSecret: intent.clientSecret, mode: stripeMode(), amount: booking.total, currency: booking.currency });
  });
}
