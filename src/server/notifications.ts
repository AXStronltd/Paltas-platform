import { prisma } from "@/server/db";
import { enqueueAndSend, appUrl } from "@/server/mail";
import { dedupeKey } from "@/lib/mail/outbox";
import { bookingConfirmed, bookingCancelled, passwordReset } from "@/lib/mail/templates";
import { DEFAULT_MARKET } from "@/lib/i18n/locales";
import type { NotificationKind } from "@prisma/client";

/**
 * The events worth telling somebody about.
 *
 * One module between the routes that know a thing happened and the outbox that
 * knows how to send. Routes stay thin, the queries live in one place, and a
 * booking confirmation is composed identically whether it was a webhook, a
 * retry, or a script that noticed the gap later.
 *
 * Every function here is best-effort and never throws. A booking is confirmed
 * whether or not the guest could be emailed about it, and a mail provider
 * having a bad afternoon must not turn a successful payment into a 500 that
 * Stripe then retries.
 */

/**
 * Record something in the recipient's in-app notifications.
 *
 * Lives beside the email functions rather than in a module of its own, because
 * "a booking was confirmed" is one event with two ways of being told about it.
 * Splitting them is how a platform ends up emailing about something its own
 * notification bell has never heard of.
 *
 * Best-effort and never throws, for the same reason the mail functions are not:
 * a booking is confirmed whether or not anyone could be told, and a failed
 * insert must not turn a successful payment into a 500 that Stripe retries.
 *
 * Idempotent on (recipient, kind, entityId), so a webhook delivered twice — or
 * a script noticing the gap later — records one notification, and re-delivery
 * never marks a read one unread.
 */
export async function record(input: {
  guestId?: string | null;
  userId?: string | null;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  entityId?: string;
}): Promise<void> {
  if (!input.guestId && !input.userId) return;
  const entityId = input.entityId ?? "";
  try {
    await prisma.notification.upsert({
      where: input.guestId
        ? { guestId_kind_entityId: { guestId: input.guestId, kind: input.kind, entityId } }
        : { userId_kind_entityId: { userId: input.userId!, kind: input.kind, entityId } },
      update: {},
      create: {
        guestId: input.guestId ?? null,
        userId: input.userId ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        entityId,
      },
    });
  } catch {
    // Deliberately silent. See above.
  }
}

const BOOKING_FIELDS = {
  id: true, reference: true, checkIn: true, checkOut: true,
  nights: true, guests: true, total: true, currency: true,
  guest: { select: { id: true, name: true, email: true, locale: true, country: true } },
  listing: { select: { title: true, city: true, country: true } },
} as const;

/** The guest's own market if we know it, so money and dates read locally. */
function marketOf(country: string | null | undefined): string {
  return country ?? DEFAULT_MARKET;
}

async function loadBooking(bookingId: string) {
  return prisma.booking.findUnique({ where: { id: bookingId }, select: BOOKING_FIELDS });
}

/**
 * The guest has paid and the stay is theirs.
 *
 * Called outside the "did this delivery change anything" guard on purpose, and
 * for the same reason `recordEarning` is: a webhook confirmed by one delivery
 * and duplicated by a later one must still produce exactly one email, and the
 * unique constraint on `dedupeKey` — not a branch — is what guarantees it.
 */
export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  try {
    const booking = await loadBooking(bookingId);
    if (!booking?.guest?.email) return;

    await enqueueAndSend({
      kind: "booking.confirmed",
      dedupeKey: dedupeKey("booking.confirmed", booking.id),
      to: booking.guest.email,
      locale: booking.guest.locale,
      message: bookingConfirmed({
        guestName: booking.guest.name,
        guestLocale: booking.guest.locale,
        market: marketOf(booking.guest.country),
        reference: booking.reference,
        listingTitle: booking.listing.title,
        city: booking.listing.city,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        guests: booking.guests,
        total: booking.total,
        currency: booking.currency,
        bookingUrl: `${appUrl()}/bookings`,
        helpUrl: `${appUrl()}/help`,
      }),
    });

    await record({
      guestId: booking.guest.id, kind: "BOOKING",
      title: "Your booking is confirmed",
      body: `${booking.listing.title} — ${booking.reference}`,
      href: "/bookings", entityId: `confirmed:${booking.id}`,
    });
  } catch {
    /* A booking is confirmed whether or not we could write about it. */
  }
}

export async function notifyBookingCancelled(bookingId: string): Promise<void> {
  try {
    const booking = await loadBooking(bookingId);
    if (!booking?.guest?.email) return;

    await enqueueAndSend({
      kind: "booking.cancelled",
      dedupeKey: dedupeKey("booking.cancelled", booking.id),
      to: booking.guest.email,
      locale: booking.guest.locale,
      message: bookingCancelled({
        guestName: booking.guest.name,
        guestLocale: booking.guest.locale,
        market: marketOf(booking.guest.country),
        reference: booking.reference,
        listingTitle: booking.listing.title,
        city: booking.listing.city,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        nights: booking.nights,
        guests: booking.guests,
        total: booking.total,
        currency: booking.currency,
        bookingUrl: `${appUrl()}/bookings`,
        helpUrl: `${appUrl()}/help`,
      }),
    });

    await record({
      guestId: booking.guest.id, kind: "BOOKING",
      title: "Your booking was cancelled",
      body: `${booking.listing.title} — ${booking.reference}`,
      href: "/bookings", entityId: `cancelled:${booking.id}`,
    });
  } catch {
    /* Cancelling worked; telling them about it is separate. */
  }
}

/**
 * A reset link, by email.
 *
 * The token is passed in rather than read here: it exists in plain form for one
 * instant in the route that minted it, and this is the only place it is allowed
 * to go. It is not returned, not logged, and the dedupe key is built from the
 * reset record's id — so two requests five minutes apart send two emails, which
 * is correct, while one request retried does not.
 */
export async function notifyPasswordReset(input: {
  resetId: string;
  to: string;
  name: string;
  locale: string | null;
  country: string | null;
  token: string;
  expiresInMinutes: number;
}): Promise<void> {
  try {
    await enqueueAndSend({
      kind: "auth.reset",
      dedupeKey: dedupeKey("auth.reset", input.resetId),
      to: input.to,
      locale: input.locale,
      message: passwordReset({
        name: input.name,
        locale: input.locale,
        market: marketOf(input.country),
        resetUrl: `${appUrl()}/reset?token=${encodeURIComponent(input.token)}`,
        expiresInMinutes: input.expiresInMinutes,
        helpUrl: `${appUrl()}/help`,
      }),
    });
  } catch {
    /* The same answer goes back to the caller either way — see the route. */
  }
}
