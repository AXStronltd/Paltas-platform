/**
 * Availability and booking arithmetic — pure, so the rules that decide whether a
 * property can be sold twice can be read and tested without a database.
 *
 * The interval convention throughout: a stay occupies `[checkIn, checkOut)`.
 * Check-out day is free. Getting this wrong by one day is the classic booking
 * bug — it either blocks a night that is available or, worse, sells one that is
 * not — so it is stated once here and every comparison follows it.
 */

export interface DateRange {
  from: Date;
  to: Date;
}

export interface Occupancy extends DateRange {
  /** How many rooms this occupies. Always 1 for a whole-property listing. */
  rooms: number;
}

/**
 * Do two stays overlap?
 *
 * Back-to-back stays do not: one guest leaving on the 5th and another arriving
 * on the 5th is the normal case, not a conflict.
 */
export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.from < b.to && b.from < a.to;
}

export function nightsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/** A range is bookable only if it is the right way round and in the future. */
export function isValidRange(from: Date, to: Date, now = new Date()): { ok: boolean; reason?: string } {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, reason: "Those dates are not valid." };
  }
  if (to <= from) return { ok: false, reason: "Check-out must be after check-in." };
  // Compare against the start of today, so a booking made this morning for
  // tonight is not rejected as being in the past.
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (from < today) return { ok: false, reason: "Check-in cannot be in the past." };
  if (nightsBetween(from, to) > 365) return { ok: false, reason: "A stay cannot exceed 365 nights." };
  return { ok: true };
}

/**
 * Rooms already taken on the busiest night of a requested range.
 *
 * The peak matters, not the total: five separate one-night bookings across a
 * week occupy one room at a time, whereas five overlapping ones occupy five.
 * Summing them would refuse bookings that are perfectly sellable.
 */
export function peakOccupancy(existing: Occupancy[], requested: DateRange): number {
  const relevant = existing.filter((e) => overlaps(e, requested));
  if (relevant.length === 0) return 0;

  // Occupancy only changes when a stay begins, so those are the only nights
  // worth measuring — plus the first night of the range itself.
  const boundaries = new Set<number>([requested.from.getTime()]);
  for (const e of relevant) {
    if (e.from > requested.from && e.from < requested.to) boundaries.add(e.from.getTime());
  }

  let peak = 0;
  for (const t of boundaries) {
    const at = new Date(t);
    const rooms = relevant
      .filter((e) => e.from <= at && at < e.to)
      .reduce((total, e) => total + e.rooms, 0);
    peak = Math.max(peak, rooms);
  }
  return peak;
}

export interface AvailabilityAnswer {
  available: boolean;
  reason?: string;
  /** Rooms free on the tightest night of the range. */
  roomsLeft: number;
}

/**
 * Can this range be sold?
 *
 * `blocks` are dates the host has withheld — maintenance, an owner stay, a
 * closed season. They are absolute: a blocked date is unavailable however much
 * inventory is otherwise free.
 */
export function checkAvailability(input: {
  requested: DateRange;
  requestedRooms: number;
  totalRooms: number;
  existing: Occupancy[];
  blocks: DateRange[];
  now?: Date;
}): AvailabilityAnswer {
  const valid = isValidRange(input.requested.from, input.requested.to, input.now);
  if (!valid.ok) return { available: false, reason: valid.reason, roomsLeft: 0 };

  if (input.blocks.some((b) => overlaps(b, input.requested))) {
    return { available: false, reason: "Those dates are not available.", roomsLeft: 0 };
  }

  const taken = peakOccupancy(input.existing, input.requested);
  const roomsLeft = Math.max(0, input.totalRooms - taken);

  if (input.requestedRooms > roomsLeft) {
    return {
      available: false,
      reason: roomsLeft === 0 ? "Fully booked for those dates." : `Only ${roomsLeft} left for those dates.`,
      roomsLeft,
    };
  }
  return { available: true, roomsLeft };
}

export interface Quote {
  nights: number;
  nightlyRate: number;
  subtotal: number;
  cleaningFee: number;
  serviceFee: number;
  taxes: number;
  discountAmount: number;
  total: number;
  currency: string;
}

/**
 * Price a stay.
 *
 * Mirrors the marketplace's transparent-pricing rules so the quote a guest is
 * shown and the amount they are charged come from the same arithmetic. Every
 * figure is a whole minor unit — money and binary fractions do not mix.
 */
export function quote(input: {
  nightlyRate: number;
  nights: number;
  rooms?: number;
  currency: string;
  cleaningFee?: number;
  serviceRate?: number;
  taxRate?: number;
  discountAmount?: number;
}): Quote {
  const rooms = Math.max(1, input.rooms ?? 1);
  const subtotal = input.nightlyRate * input.nights * rooms;
  const cleaningFee = input.cleaningFee ?? 0;
  const serviceFee = Math.round(subtotal * (input.serviceRate ?? 0.08));
  const discountAmount = Math.min(subtotal, input.discountAmount ?? 0);
  const taxable = subtotal + cleaningFee + serviceFee - discountAmount;
  const taxes = Math.round(Math.max(0, taxable) * (input.taxRate ?? 0.05));
  const total = Math.max(0, taxable + taxes);

  return {
    nights: input.nights, nightlyRate: input.nightlyRate, subtotal,
    cleaningFee, serviceFee, taxes, discountAmount, total, currency: input.currency,
  };
}
