/**
 * The guest's own account and bookings.
 *
 * Separate from `managementService` because guests are a separate authority:
 * their own table, their own cookie, and no permissions at all — only ownership
 * of their own rows. Keeping the two clients apart makes it hard to write a
 * screen that quietly reaches for staff data with a guest session, or the
 * reverse.
 *
 * Errors are returned rather than thrown. A booking flow that white-screens
 * because a card was declined is worse than one that says the card was declined.
 */

export interface GuestFailure { code: string; message: string }
export interface GuestResult<T> { data: T | null; error: GuestFailure | null }

async function request<T>(method: string, path: string, body?: unknown): Promise<GuestResult<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: GuestFailure } | null;
      return { data: null, error: payload?.error ?? { code: String(res.status), message: res.statusText } };
    }
    return { data: (await res.json()) as T, error: null };
  } catch {
    return { data: null, error: { code: "network", message: "Could not reach the server." } };
  }
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b?: unknown) => request<T>("POST", p, b);

/* -------------------------------- Account ------------------------------- */

export interface Guest {
  id: string; email: string; name: string; phone: string | null;
  country: string | null; locale: string | null;
}

export const currentGuest = () => get<{ guest: Guest | null }>("/guest/me");

export const registerGuest = (input: {
  email: string; name: string; password: string; phone?: string; country?: string; locale?: string;
}) => post<{ guest: Guest }>("/guest/register", input);

export const loginGuest = (input: { email: string; password: string }) =>
  post<{ guest: Guest }>("/guest/login", input);

export const logoutGuest = () => post<{ ok: true }>("/guest/logout");

/* --------------------------------- Quotes ------------------------------- */

export interface Quote {
  nights: number; nightlyRate: number; subtotal: number; cleaningFee: number;
  serviceFee: number; taxes: number; discountAmount: number; total: number; currency: string;
}

export interface QuoteAnswer {
  available: boolean;
  reason: string | null;
  roomsLeft: number;
  quote: Quote;
  /** Always true. The booking request re-checks under a lock; this does not. */
  provisional: boolean;
}

/**
 * What a stay would cost, and whether it can be had.
 *
 * Public — a shopfront must be able to show a total before asking anyone to
 * sign in. Its answer can go stale between here and checkout, which is why the
 * server re-checks; treat `available` as an invitation, never a reservation.
 */
export const getQuote = (listingId: string, input: {
  checkIn: string; checkOut: string; rooms?: number; roomTypeId?: string | null;
}) => {
  const q = new URLSearchParams({ checkIn: input.checkIn, checkOut: input.checkOut });
  if (input.rooms) q.set("rooms", String(input.rooms));
  if (input.roomTypeId) q.set("roomTypeId", input.roomTypeId);
  return get<QuoteAnswer>(`/public/listings/${listingId}/quote?${q}`);
};

/* -------------------------------- Bookings ------------------------------ */

export type BookingStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "REFUNDED";

export interface GuestBooking {
  id: string; reference: string; checkIn: string; checkOut: string; nights: number;
  guests: number; rooms: number; total: number; currency: string; status: BookingStatus;
  createdAt: string; cancelReason: string | null;
  subtotal?: number; cleaningFee?: number; serviceFee?: number; taxes?: number; discountAmount?: number;
  nightlyRate?: number; guestNote?: string | null; confirmedAt?: string | null;
  listing: { id: string; title: string; city: string | null; images: string[]; hostName: string; kind: string } | null;
  roomType: { name: string; beds?: string | null } | null;
  review?: { id: string; stars: number } | null;
  events?: { status: string; note: string; at: string; actor: string }[];
}

export const getMyBookings = () => get<{ bookings: GuestBooking[] }>("/bookings");
export const getMyBooking = (id: string) => get<{ booking: GuestBooking }>(`/bookings/${id}`);

/**
 * Request a booking.
 *
 * `idempotencyKey` is required by the server, not optional: without one a
 * double tap on a slow connection becomes two bookings and two charges. Make it
 * once per attempt and reuse it across retries — that is the whole point.
 */
export const createBooking = (input: {
  listingId: string; roomTypeId?: string | null;
  checkIn: string; checkOut: string; guests: number; rooms: number;
  guestNote?: string; idempotencyKey: string;
}) => post<{ booking: GuestBooking; reused: boolean }>("/bookings", input);

export const cancelBooking = (id: string, reason: string) =>
  post<{ cancelled: true }>(`/bookings/${id}/cancel`, { reason });

/** Start paying. Returns only a client secret; the amount comes from the row. */
export const payForBooking = (id: string) =>
  post<{ clientSecret: string; mode: string; amount: number; currency: string }>(`/bookings/${id}/pay`);

/* -------------------------------- Display ------------------------------- */

export function money(amount: number, currency: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/** A key that survives a retry but not a genuinely new attempt. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
