import { api } from "./managementApi";

/**
 * Rooms, bookings and availability — the hotel and landlord half of the portal.
 *
 * Built on the same client as managementService, so a 403 arrives here as an
 * ordinary answer carrying its reason rather than as an exception. That matters
 * on these screens: a guard reading the arrivals board and a manager editing
 * rates are looking at the same page with different authority, and the page has
 * to say which parts are closed to them instead of failing.
 *
 * Nothing here is the security boundary. Every one of these paths authorises
 * server-side; this file only decides what to ask for.
 */

const qs = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

/* --------------------------------- Types -------------------------------- */

export interface RoomType {
  id: string; propertyId: string; name: string; description: string | null;
  rate: number; currency: string; totalRooms: number; maxGuests: number;
  beds: string | null; amenities: string[]; active: boolean;
  property?: { id: string; name: string };
  listing?: { id: string; title: string; status: string } | null;
  _count?: { bookings: number };
}

export interface HostBooking {
  id: string; reference: string; checkIn: string; checkOut: string; nights: number;
  guests: number; rooms: number; total: number; currency: string; status: BookingStatus;
  guestNote: string | null; createdAt: string; confirmedAt: string | null; cancelReason: string | null;
  guest: { id: string; name: string; email: string; phone: string | null; country: string | null };
  listing: { id: string; title: string } | null;
  property: { id: string; name: string };
  roomType: { id: string; name: string } | null;
}

export type BookingStatus = "PENDING" | "CONFIRMED" | "CHECKED_IN" | "COMPLETED" | "CANCELLED" | "REFUNDED";

export interface CalendarNight { date: string; available: number; blocked: boolean; reason: string | null }
export interface CalendarRow {
  roomTypeId: string; name: string; rate: number; currency: string;
  totalRooms: number; nights: CalendarNight[];
}
export interface Calendar {
  from: string; to: string; days: string[]; rows: CalendarRow[];
  tonight: { total: number; free: number; occupancyPct: number };
}

export interface BlockRow {
  id: string; propertyId: string; from: string; to: string; reason: string;
  property?: { id: string; name: string };
  listing?: { id: string; title: string } | null;
  roomType?: { id: string; name: string } | null;
}

/* ------------------------------ Room types ------------------------------ */

export const getRoomTypes = (propertyId?: string) =>
  api.get<{ roomTypes: RoomType[] }>(`/roomtypes${qs({ propertyId })}`);

export const createRoomType = (input: {
  propertyId: string; listingId?: string; name: string; description?: string;
  rate: number; currency?: string; totalRooms: number; maxGuests?: number;
  beds?: string; amenities?: string[];
}) => api.post<{ roomType: RoomType }>("/roomtypes", input);

/**
 * Returns a `warning` when the new inventory is below what is already sold.
 * Surface it — the alternative is a host discovering it at the front desk.
 */
export const updateRoomType = (id: string, input: Partial<Omit<RoomType, "id" | "propertyId">>) =>
  api.patch<{ roomType: RoomType; warning: string | null }>(`/roomtypes/${id}`, input);

export const removeRoomType = (id: string) =>
  api.del<{ deleted: boolean; deactivated: boolean }>(`/roomtypes/${id}`);

/* ------------------------------- Calendar ------------------------------- */

export const getCalendar = (input: { propertyId?: string; days?: number } = {}) =>
  api.get<Calendar>(`/host/calendar${qs({ propertyId: input.propertyId, days: input.days ?? 14 })}`);

/* ------------------------------- Bookings ------------------------------- */

export const getHostBookings = (input: { propertyId?: string; status?: BookingStatus } = {}) =>
  api.get<{ bookings: HostBooking[]; counts: Partial<Record<BookingStatus, number>>; revenue: number }>(
    `/host/bookings${qs(input)}`,
  );

/**
 * Move a booking along. The server enforces which moves are legal from which
 * state and which permission each one needs, so this is a request, not a
 * command — `cancel` additionally requires a note.
 */
export const moveBooking = (id: string, action: "confirm" | "checkin" | "checkout" | "cancel", note?: string) =>
  api.patch<{ booking: HostBooking }>(`/host/bookings/${id}`, { action, note });

/* ----------------------------- Availability ----------------------------- */

export const getBlocks = (propertyId?: string) =>
  api.get<{ blocks: BlockRow[] }>(`/availability${qs({ propertyId })}`);

export const blockDates = (input: {
  propertyId: string; listingId?: string; roomTypeId?: string;
  from: string; to: string; reason: string;
}) => api.post<{ block: BlockRow; warning: string | null }>("/availability", input);

export const releaseDates = (id: string) => api.del<{ deleted: boolean }>(`/availability/${id}`);

/* -------------------------------- Display ------------------------------- */

/**
 * Money in the currency it is actually held in. Never converted for display —
 * showing a Kenyan rate with a euro symbol because of a browser setting would
 * be worse than showing nothing.
 */
export function money(amount: number, currency: string, locale = "en"): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export const shortDate = (iso: string, locale = "en") =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));

/* ------------------------------- Landlord ------------------------------- */

/**
 * These endpoints already existed for the management portal; the landlord
 * screens read the same rows rather than a parallel copy, so a landlord and a
 * property manager looking at the same unit see the same truth.
 *
 * Note `rentVisible` and `contactVisible`: the API states which fields it chose
 * to withhold. The UI must say "you do not have access to rent" rather than
 * render a dash, which reads as "no rent set".
 */
export interface LandlordUnit {
  id: string; propertyId: string; propertyName: string;
  buildingId: string | null; buildingName: string | null;
  name: string; floor: number | null; bedrooms: number | null;
  status: "OCCUPIED" | "VACANT" | "NOTICE" | "MAINTENANCE";
  residents: { id: string; fullName: string; isPrimary: boolean }[];
  rentAmount?: number; currency?: string;
}

export interface LandlordResident {
  id: string; propertyId: string; unitId: string | null; unitName: string | null;
  fullName: string; type: string; isPrimary: boolean;
  email: string | null; phone: string | null;
  moveInAt: string | null; leaseEnd: string | null;
}

export type MaintenanceStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface MaintenanceRow {
  id: string; propertyId: string; propertyName: string; unitName: string | null;
  title: string; description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: MaintenanceStatus;
  raisedByName: string | null; assignedToId: string | null;
  createdAt: string; resolvedAt: string | null;
}

export const getUnits = (propertyId?: string) =>
  api.get<{ units: LandlordUnit[]; rentVisible: boolean }>(`/units${qs({ propertyId })}`);

export const getResidents = (propertyId?: string) =>
  api.get<{ residents: LandlordResident[]; contactVisible: boolean }>(`/residents${qs({ propertyId })}`);

export const getMaintenance = (input: { propertyId?: string; status?: MaintenanceStatus } = {}) =>
  api.get<{ requests: MaintenanceRow[] }>(`/maintenance${qs(input)}`);

/** Resolving is a distinct permission from updating — see the route's note. */
export const updateMaintenance = (
  id: string,
  input: { status?: MaintenanceStatus; assignedToId?: string | null; note?: string },
) => api.patch<{ request: MaintenanceRow }>(`/maintenance/${id}`, input);
