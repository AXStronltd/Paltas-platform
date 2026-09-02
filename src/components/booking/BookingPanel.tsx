"use client";

import { useCallback, useEffect, useState } from "react";
import type { Listing } from "@/lib/models";
import { getQuote, isoDate, money, type QuoteAnswer } from "@/lib/services/guestService";
import { GuestCheckout } from "./GuestCheckout";

/**
 * Dates, guests, and what it would actually cost.
 *
 * Every figure shown here comes from the server. The browser sends dates and a
 * room count and is told the total — it never computes one, because a price the
 * client worked out is a price the client can change.
 *
 * The quote is explicitly provisional. Between seeing it and paying, someone
 * else may take the last room, so the booking request re-checks under a lock
 * and that check is the one that decides. The panel says so rather than
 * implying the room is held.
 */
export function BookingPanel({ listing }: { listing: Listing }) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const threeNights = new Date(tomorrow); threeNights.setDate(threeNights.getDate() + 3);

  const [checkIn, setCheckIn] = useState(isoDate(tomorrow));
  const [checkOut, setCheckOut] = useState(isoDate(threeNights));
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [roomTypeId, setRoomTypeId] = useState<string | null>(listing.roomTypes?.[0]?.id ?? null);
  const [answer, setAnswer] = useState<QuoteAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const quote = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getQuote(listing.id, { checkIn, checkOut, rooms, roomTypeId });
    setLoading(false);
    if (res.error) { setAnswer(null); setError(res.error.message); return; }
    setAnswer(res.data);
  }, [listing.id, checkIn, checkOut, rooms, roomTypeId]);

  // Requote whenever anything that changes the price changes. Debounced so
  // typing a date does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { void quote(); }, 250);
    return () => clearTimeout(t);
  }, [quote]);

  const q = answer?.quote;
  const canBook = Boolean(answer?.available) && !loading;
  const roomType = listing.roomTypes?.find((r) => r.id === roomTypeId);
  const currency = roomType?.currency ?? listing.currency;

  return (
    <div className="book-card">
      <div className="book-price">
        <b>{money(roomType?.rate ?? listing.price, currency)}</b>
        <span> per night</span>
      </div>

      {listing.roomTypes && listing.roomTypes.length > 0 && (
        <div className="bf">
          <label htmlFor="bp-room">Room</label>
          <select id="bp-room" value={roomTypeId ?? ""} onChange={(e) => setRoomTypeId(e.target.value)}>
            {listing.roomTypes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {money(r.rate, r.currency)}/night
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="book-fields">
        <div className="bf">
          <label htmlFor="bp-in">Check-in</label>
          <input id="bp-in" type="date" value={checkIn} min={isoDate(new Date())}
            onChange={(e) => setCheckIn(e.target.value)} />
        </div>
        <div className="bf">
          <label htmlFor="bp-out">Check-out</label>
          <input id="bp-out" type="date" value={checkOut} min={checkIn}
            onChange={(e) => setCheckOut(e.target.value)} />
        </div>
      </div>

      <div className="book-fields">
        <div className="bf">
          <label htmlFor="bp-guests">Guests</label>
          <input id="bp-guests" type="number" min={1} max={listing.maxGuests * rooms} value={guests}
            onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        {listing.roomTypes && listing.roomTypes.length > 0 && (
          <div className="bf">
            <label htmlFor="bp-rooms">Rooms</label>
            <input id="bp-rooms" type="number" min={1} max={20} value={rooms}
              onChange={(e) => setRooms(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        )}
      </div>

      {error && <div className="book-note bad">{error}</div>}

      {answer && !answer.available && (
        <div className="book-note bad">{answer.reason ?? "Not available for those dates."}</div>
      )}

      {answer?.available && answer.roomsLeft <= 3 && listing.roomTypes?.length ? (
        <div className="book-note">Only {answer.roomsLeft} left for those dates.</div>
      ) : null}

      {q && answer?.available && (
        <div className="book-breakdown">
          <div><span>{money(q.nightlyRate, q.currency)} × {q.nights} nights{rooms > 1 ? ` × ${rooms} rooms` : ""}</span><span>{money(q.subtotal, q.currency)}</span></div>
          {q.cleaningFee > 0 && <div><span>Cleaning</span><span>{money(q.cleaningFee, q.currency)}</span></div>}
          <div><span>Service fee</span><span>{money(q.serviceFee, q.currency)}</span></div>
          <div><span>Taxes</span><span>{money(q.taxes, q.currency)}</span></div>
          {q.discountAmount > 0 && <div><span>Discount</span><span>−{money(q.discountAmount, q.currency)}</span></div>}
          <div className="book-total"><span>Total</span><span>{money(q.total, q.currency)}</span></div>
        </div>
      )}

      <button className="btn btn-primary" disabled={!canBook} onClick={() => setCheckoutOpen(true)}>
        {loading ? "Checking availability…" : answer?.available ? "Reserve" : "Not available"}
      </button>

      <div className="reassure">
        This price is what you pay — there is nothing added at the end.
        {" "}Dates are only held once your booking is confirmed.
      </div>

      {checkoutOpen && q && (
        <GuestCheckout
          listing={listing}
          quote={q}
          request={{ checkIn, checkOut, guests, rooms, roomTypeId }}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </div>
  );
}
