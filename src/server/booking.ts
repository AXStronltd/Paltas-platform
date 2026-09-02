import { Prisma, type BookingStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { checkAvailability, isValidRange, nightsBetween, quote, type Occupancy } from "@/lib/booking/availability";

/**
 * Booking, server side.
 *
 * Two hazards shape this file:
 *
 *  1. **The race.** Two guests requesting the last room at the same moment will
 *     both read "1 available" if the check and the write are separate steps.
 *     So the re-check happens *inside* a Serializable transaction — Postgres
 *     then aborts one of the pair rather than letting both commit.
 *
 *  2. **The retry.** A guest on a bad connection taps "Book" twice, or the
 *     client retries a request whose response was lost. The idempotency key is
 *     unique in the database, so the second attempt returns the first booking
 *     instead of creating a second one. It is enforced by the schema, not by a
 *     prior lookup, because a lookup is itself racy.
 *
 * Prices are never taken from the client. The rate comes from the room type or
 * the listing and the total is recomputed here, so a tampered payload buys
 * nothing.
 */

/** Which bookings still hold inventory. Cancelled ones release it. */
const HOLDS_INVENTORY: BookingStatus[] = ["PENDING", "CONFIRMED", "CHECKED_IN", "COMPLETED"];

export interface BookingRequest {
  listingId: string;
  roomTypeId?: string | null;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  rooms: number;
  guestNote?: string | null;
  idempotencyKey: string;
}

export type BookingOutcome =
  | { ok: true; booking: Awaited<ReturnType<typeof loadBooking>>; reused: boolean }
  | { ok: false; status: number; error: string };

function loadBooking(id: string) {
  return prisma.booking.findUniqueOrThrow({
    where: { id },
    include: {
      listing: { select: { id: true, title: true, city: true, kind: true, images: true, hostName: true } },
      roomType: { select: { id: true, name: true } },
    },
  });
}

/** Human-readable and unguessable — a guest reads it aloud at a front desk. */
function reference(): string {
  const alphabet = "ACDEFGHJKLMNPQRTUVWXY3479";
  let out = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(8))) out += alphabet[byte % alphabet.length];
  return `PLT-${out.slice(0, 4)}-${out.slice(4)}`;
}

/**
 * Everything currently occupying a listing or room type over a window.
 *
 * Reads inside the caller's transaction — outside it, the answer is stale by
 * the time it is used.
 */
async function occupancyFor(
  tx: Prisma.TransactionClient,
  scope: { listingId: string; roomTypeId?: string | null },
  window: { from: Date; to: Date },
): Promise<{ existing: Occupancy[]; blocks: { from: Date; to: Date }[] }> {
  const [bookings, blocks] = await Promise.all([
    tx.booking.findMany({
      where: {
        listingId: scope.listingId,
        ...(scope.roomTypeId ? { roomTypeId: scope.roomTypeId } : {}),
        status: { in: HOLDS_INVENTORY },
        // Overlap in SQL, using the same half-open convention as the engine.
        checkIn: { lt: window.to },
        checkOut: { gt: window.from },
      },
      select: { checkIn: true, checkOut: true, rooms: true },
    }),
    tx.availabilityBlock.findMany({
      where: {
        OR: [
          { listingId: scope.listingId },
          ...(scope.roomTypeId ? [{ roomTypeId: scope.roomTypeId }] : []),
        ],
        from: { lt: window.to },
        to: { gt: window.from },
      },
      select: { from: true, to: true },
    }),
  ]);

  return {
    existing: bookings.map((b) => ({ from: b.checkIn, to: b.checkOut, rooms: b.rooms })),
    blocks: blocks.map((b) => ({ from: b.from, to: b.to })),
  };
}

/**
 * What a stay would cost and whether it can be had — without booking it.
 *
 * The shopfront calls this on every date change, so it takes no lock and writes
 * nothing. Its answer is advisory: `create` re-checks under a transaction, and
 * that check is the one that decides.
 */
export async function priceAndCheck(input: {
  listingId: string;
  roomTypeId?: string | null;
  checkIn: Date;
  checkOut: Date;
  rooms: number;
}) {
  const listing = await prisma.propertyListing.findFirst({
    where: { id: input.listingId, status: "PUBLISHED" },
    select: { id: true, price: true, currency: true, maxGuests: true, propertyId: true, unitId: true, kind: true },
  });
  if (!listing) return { ok: false as const, status: 404, error: "That listing is not available." };

  const roomType = input.roomTypeId
    ? await prisma.hotelRoomType.findFirst({
        where: { id: input.roomTypeId, listingId: listing.id, active: true },
        select: { id: true, rate: true, currency: true, totalRooms: true, maxGuests: true, name: true },
      })
    : null;
  if (input.roomTypeId && !roomType) {
    return { ok: false as const, status: 404, error: "That room type is not available." };
  }

  const valid = isValidRange(input.checkIn, input.checkOut);
  if (!valid.ok) return { ok: false as const, status: 400, error: valid.reason! };

  const { existing, blocks } = await occupancyFor(
    prisma as unknown as Prisma.TransactionClient,
    { listingId: listing.id, roomTypeId: roomType?.id },
    { from: input.checkIn, to: input.checkOut },
  );

  // A whole-property listing is one sellable unit; a hotel room type has many.
  const totalRooms = roomType?.totalRooms ?? 1;
  const answer = checkAvailability({
    requested: { from: input.checkIn, to: input.checkOut },
    requestedRooms: input.rooms,
    totalRooms,
    existing,
    blocks,
  });

  const nightlyRate = roomType?.rate ?? listing.price;
  const q = quote({
    nightlyRate,
    nights: nightsBetween(input.checkIn, input.checkOut),
    rooms: input.rooms,
    currency: roomType?.currency ?? listing.currency,
  });

  return { ok: true as const, listing, roomType, availability: answer, quote: q, totalRooms };
}

/**
 * Create a booking, or return the one this idempotency key already made.
 */
export async function createBooking(guestId: string, req: BookingRequest): Promise<BookingOutcome> {
  const priced = await priceAndCheck({
    listingId: req.listingId,
    roomTypeId: req.roomTypeId,
    checkIn: req.checkIn,
    checkOut: req.checkOut,
    rooms: req.rooms,
  });
  if (!priced.ok) return priced;

  const capacity = (priced.roomType?.maxGuests ?? priced.listing.maxGuests) * req.rooms;
  if (req.guests > capacity) {
    return { ok: false, status: 400, error: `That booking sleeps at most ${capacity}.` };
  }
  if (!priced.availability.available) {
    return { ok: false, status: 409, error: priced.availability.reason ?? "Not available." };
  }

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        // The authoritative check. Everything above was advisory — between that
        // read and this line another guest may have taken the last room.
        const { existing, blocks } = await occupancyFor(
          tx,
          { listingId: priced.listing.id, roomTypeId: priced.roomType?.id },
          { from: req.checkIn, to: req.checkOut },
        );
        const answer = checkAvailability({
          requested: { from: req.checkIn, to: req.checkOut },
          requestedRooms: req.rooms,
          totalRooms: priced.totalRooms,
          existing,
          blocks,
        });
        if (!answer.available) {
          throw new BookingConflict(answer.reason ?? "Those dates were just taken.");
        }

        const booking = await tx.booking.create({
          data: {
            reference: reference(),
            guestId,
            listingId: priced.listing.id,
            propertyId: priced.listing.propertyId,
            unitId: priced.listing.unitId,
            roomTypeId: priced.roomType?.id ?? null,
            checkIn: req.checkIn,
            checkOut: req.checkOut,
            guests: req.guests,
            rooms: req.rooms,
            nightlyRate: priced.quote.nightlyRate,
            nights: priced.quote.nights,
            subtotal: priced.quote.subtotal,
            cleaningFee: priced.quote.cleaningFee,
            serviceFee: priced.quote.serviceFee,
            taxes: priced.quote.taxes,
            discountAmount: priced.quote.discountAmount,
            total: priced.quote.total,
            currency: priced.quote.currency,
            status: "PENDING",
            idempotencyKey: req.idempotencyKey,
            guestNote: req.guestNote ?? null,
          },
          select: { id: true },
        });

        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            status: "PENDING",
            note: "Booking requested, awaiting payment.",
            actor: "guest",
            actorId: guestId,
          },
        });

        return booking.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { ok: true, booking: await loadBooking(created), reused: false };
  } catch (err) {
    if (err instanceof BookingConflict) return { ok: false, status: 409, error: err.message };

    // The unique index on idempotencyKey caught a retry. Return the original —
    // the guest asked once and must be charged once.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const prior = await prisma.booking.findUnique({
        where: { idempotencyKey: req.idempotencyKey },
        select: { id: true, guestId: true },
      });
      if (prior?.guestId === guestId) {
        return { ok: true, booking: await loadBooking(prior.id), reused: true };
      }
      // Someone else's key. Say nothing about whose.
      return { ok: false, status: 409, error: "That request could not be completed." };
    }

    // Serializable aborted the losing side of a genuine race.
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2034" || err.code === "P2028")) {
      return { ok: false, status: 409, error: "Those dates were just taken. Please try again." };
    }
    throw err;
  }
}

class BookingConflict extends Error {}

/** Cancellation, by the guest who made it. Releases the inventory. */
export async function cancelBooking(
  guestId: string,
  bookingId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, guestId: true, status: true },
  });
  // Same answer for "not yours" and "does not exist" — otherwise the endpoint
  // confirms which booking ids are real.
  if (!booking || booking.guestId !== guestId) {
    return { ok: false, status: 404, error: "Booking not found." };
  }
  if (booking.status === "CANCELLED" || booking.status === "REFUNDED") return { ok: true };
  if (booking.status === "CHECKED_IN" || booking.status === "COMPLETED") {
    return { ok: false, status: 409, error: "A stay in progress cannot be cancelled here." };
  }

  await prisma.$transaction([
    prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.slice(0, 400) },
    }),
    prisma.bookingEvent.create({
      data: {
        bookingId, status: "CANCELLED",
        note: reason.slice(0, 400) || "Cancelled by guest.",
        actor: "guest", actorId: guestId,
      },
    }),
  ]);
  return { ok: true };
}
