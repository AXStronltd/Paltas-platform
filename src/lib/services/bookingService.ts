import { isMock } from "@/lib/config";
import type { Booking, BookingEvent, BookingStatus, Listing, Result } from "@/lib/models";
import { priceBreakdown, paymentModeFor } from "./pricingService";
import { createEscrow } from "./escrowService";
import { HOSTS } from "@/lib/data/mock";
import { providers, providerFor } from "@/lib/providers/registry";
import type { PaymentMethod } from "@/lib/providers/interfaces";
import { apiPost, mockDelay } from "./apiClient";

/**
 * Booking service — orchestrates the full PALTAS booking lifecycle through the
 * provider layer. This is the marketplace's money moment (pay -> hold in escrow
 * -> release to host), NOT a payments-transfer app.
 *
 * Every transition is recorded as a BookingEvent (audit trail / status
 * timeline). Idempotency keys are honoured so a retried payment never
 * double-books. Failure and reversal are first-class outcomes.
 */

const bookings: Booking[] = [];
const seenKeys = new Map<string, Booking>();

interface CreateBookingInput {
  listing: Listing;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  buyerId: string;
  buyerName: string;
  idempotencyKey: string;
  simulateFailure?: boolean;
  method: PaymentMethod;
  providerName: string;
  phone?: string;
}

function event(status: BookingStatus, note: string): BookingEvent {
  return { status, at: Date.now(), note };
}

export async function createBooking(input: CreateBookingInput): Promise<Result<Booking>> {
  const { listing, checkIn, checkOut, nights, guests, buyerId, buyerName, idempotencyKey, simulateFailure } = input;

  if (seenKeys.has(idempotencyKey)) {
    return mockDelay({ data: seenKeys.get(idempotencyKey)!, error: null });
  }

  if (!isMock()) {
    return apiPost<Booking>(`/bookings`, input);
  }

  const breakdown = priceBreakdown(listing, nights);
  const paymentMode = paymentModeFor(listing);
  const code = "PALTAS-" + Math.random().toString(36).slice(2, 7).toUpperCase();

  const booking: Booking = {
    id: "b_" + Date.now(), code, idempotencyKey,
    listingId: listing.id, property: listing.name, location: listing.location,
    checkIn, checkOut, guests, breakdown, paymentMode,
    status: "processing", reference: "", events: [event("processing", "Payment initiated")],
    createdAt: Date.now(),
  };
  bookings.unshift(booking);
  seenKeys.set(idempotencyKey, booking);

  const provider = providerFor(input.method, input.providerName);
  let chargeRes = await provider.charge({
    amount: breakdown.total, currency: listing.currency, idempotencyKey,
    description: simulateFailure ? "FAIL booking" : `Booking ${code}`,
    method: input.method, phone: input.phone,
  });
  let intent = chargeRes.data;
  booking.reference = intent?.reference ?? "";

  // Async rails (mobile money, bank transfer) return "pending" -> poll confirm().
  if (intent && intent.status === "pending" && provider.confirm) {
    booking.events.push(event("processing", intent.pendingHint || "Awaiting confirmation"));
    for (let i = 0; i < 4 && intent.status === "pending"; i++) {
      const c = await provider.confirm(intent.reference);
      intent = c.data;
    }
  }

  if (!intent || intent.status === "failed") {
    booking.status = "failed";
    booking.failureReason = intent?.failureReason ?? "Payment could not be processed";
    booking.events.push(event("failed", booking.failureReason));
    return mockDelay({ data: booking, error: null });
  }

  // Launch mode: no escrow hold. Every booking confirms instantly. We still
  // create a booking record (for the My Bookings list + stay-confirmation flow);
  // the escrow branch is retained in code for later re-enablement.
  {
    const host = HOSTS[listing.hostId] ?? HOSTS.h5;
    const esc = await createEscrow({
      code, kind: "booking", property: listing.name, location: listing.location,
      amount: breakdown.total, currency: listing.currency,
      buyerId, buyerName, host, dates: `${checkIn} - ${checkOut}`, guests,
    });
    booking.escrowId = esc.data.id;
    booking.status = "confirmed";
    booking.events.push(event("confirmed", "Payment received - booking confirmed"));
  }

  providers.notification.send({
    to: buyerName, channel: "in-app", title: "Booking confirmed",
    body: `${listing.name} - confirmed`,
  });

  return mockDelay({ data: booking, error: null });
}

export async function reverseBooking(bookingId: string): Promise<Result<Booking>> {
  const b = bookings.find((x) => x.id === bookingId);
  if (!b) return { data: null as unknown as Booking, error: { code: "not_found", message: "Booking not found" } };
  await providers.payment.refund(b.reference);
  b.status = "reversed";
  b.events.push(event("reversed", "Payment reversed to guest"));
  return mockDelay({ data: b, error: null });
}

export async function getBooking(id: string): Promise<Result<Booking | null>> {
  if (isMock()) return mockDelay({ data: bookings.find((b) => b.id === id) ?? null, error: null });
  return apiPost<Booking | null>(`/bookings/get`, { id });
}

export async function listMyBookings(buyerId: string): Promise<Result<Booking[]>> {
  if (isMock()) return mockDelay({ data: [...bookings], error: null });
  return apiPost<Booking[]>(`/bookings/search`, { buyerId });
}

export function makeIdempotencyKey(listingId: string, buyerId: string): string {
  return `bk_${listingId}_${buyerId}_${Date.now()}`;
}
