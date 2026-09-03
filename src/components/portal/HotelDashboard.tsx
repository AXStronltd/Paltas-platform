"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRoomTypes, getCalendar, getHostBookings, createRoomType, updateRoomType,
  blockDates, moveBooking, money, shortDate,
  type RoomType, type HostBooking, type Calendar, type CalendarRow, type BookingStatus,
} from "@/lib/services/hostService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";
import { useSession } from "@/components/security/SessionProvider";
import { PERMISSIONS } from "@/lib/security/permissions";

/**
 * The hotel desk, on real data.
 *
 * Everything here reflects what the backend will actually sell: occupancy comes
 * from the same availability engine the booking endpoint uses, so the grid and
 * the shopfront cannot disagree. Actions the signed-in user is not permitted to
 * take come back as a refusal with a reason, which is shown rather than
 * swallowed — a manager should learn they lack a permission, not watch a button
 * do nothing.
 */
export function HotelDashboard() {
  const [rooms, setRooms] = useState<RoomType[] | null>(null);
  const [bookings, setBookings] = useState<HostBooking[] | null>(null);
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [revenue, setRevenue] = useState(0);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { canAt } = useSession();

  const say = (tone: "ok" | "bad", text: string) => setNotice({ tone, text });

  const load = useCallback(async () => {
    const [r, b, c] = await Promise.all([getRoomTypes(), getHostBookings(), getCalendar({ days: 7 })]);
    // A portal user may hold booking.view without roomtype.view. Each section
    // fails on its own rather than taking the page down with it.
    setRooms(r.error ? [] : r.data.roomTypes);
    setBookings(b.error ? [] : b.data.bookings);
    setCalendar(c.error ? null : c.data);
    setRevenue(b.error ? 0 : b.data.revenue);
    if (r.error && b.error) say("bad", r.error.message);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const currency = rooms?.[0]?.currency ?? bookings?.[0]?.currency ?? "KES";
  const propertyName = rooms?.[0]?.property?.name ?? bookings?.[0]?.property?.name ?? "Your property";
  const today = new Date().toISOString().slice(0, 10);
  const arrivals = (bookings ?? []).filter((b) => b.checkIn.slice(0, 10) === today);
  const inHouse = (bookings ?? []).filter((b) => b.status === "CHECKED_IN");

  async function act(id: string, action: "confirm" | "checkin" | "checkout" | "cancel") {
    let note: string | undefined;
    if (action === "cancel") {
      // The server requires a reason; asking here means the refusal never happens.
      const given = prompt("Why is this booking being cancelled? The guest will see this.");
      if (!given?.trim()) return;
      note = given.trim();
    }
    setBusy(id);
    const res = await moveBooking(id, action, note);
    setBusy(null);
    if (res.error) return say("bad", res.error.message);
    say("ok", `Booking ${action === "checkin" ? "checked in" : action === "checkout" ? "checked out" : action + "ed"}.`);
    void load();
  }

  async function editRate(r: RoomType) {
    const v = prompt(`New nightly rate for ${r.name}, in ${r.currency}:`, String(r.rate));
    if (v === null) return;
    const rate = Number(v);
    if (!Number.isInteger(rate) || rate < 0) return say("bad", "A rate must be a whole number, and not negative.");
    const res = await updateRoomType(r.id, { rate });
    if (res.error) return say("bad", res.error.message);
    say("ok", `${r.name} is now ${money(rate, r.currency)} a night.`);
    void load();
  }

  async function editInventory(r: RoomType) {
    const v = prompt(`How many ${r.name} rooms exist?`, String(r.totalRooms));
    if (v === null) return;
    const totalRooms = Number(v);
    if (!Number.isInteger(totalRooms) || totalRooms < 1) return say("bad", "A room type needs at least one room.");
    const res = await updateRoomType(r.id, { totalRooms });
    if (res.error) return say("bad", res.error.message);
    // The server warns when the new figure is below what is already sold. It
    // does not cancel anyone's stay to make the numbers agree, and says so.
    say(res.data.warning ? "bad" : "ok", res.data.warning ?? `${r.name}: ${totalRooms} rooms.`);
    void load();
  }

  async function closeDates(r: RoomType) {
    const from = prompt(`Close ${r.name} from which date? (YYYY-MM-DD)`, today);
    if (!from) return;
    const to = prompt("Until which date? Guests can arrive again on this day.", from);
    if (!to) return;
    const reason = prompt("Why? This is what you will read months from now.", "Maintenance");
    if (!reason?.trim()) return say("bad", "A reason is required.");
    const res = await blockDates({ propertyId: r.propertyId, roomTypeId: r.id, from, to, reason: reason.trim() });
    if (res.error) return say("bad", res.error.message);
    say(res.data.warning ? "bad" : "ok", res.data.warning ?? `${r.name} closed ${from} → ${to}.`);
    void load();
  }

  async function addRoom() {
    if (!rooms?.length) return say("bad", "Add a property with a room type first.");
    const name = prompt("New room type name:", "Superior twin");
    if (!name?.trim()) return;
    const rate = Number(prompt(`Nightly rate in ${currency}:`, "10000"));
    const totalRooms = Number(prompt("How many rooms of this type?", "10"));
    if (!Number.isInteger(rate) || rate < 0) return say("bad", "A rate must be a whole number, and not negative.");
    if (!Number.isInteger(totalRooms) || totalRooms < 1) return say("bad", "A room type needs at least one room.");
    const beds = prompt("Beds (optional):", "2 twin") ?? undefined;
    const res = await createRoomType({
      propertyId: rooms[0].propertyId, name: name.trim(), rate, totalRooms, currency, beds: beds || undefined,
    });
    if (res.error) return say("bad", res.error.message);
    say("ok", `Added ${name.trim()}.`);
    void load();
  }

  return (
    <PortalShell
      title={propertyName}
      subtitle="Hotel management"
      badge={calendar ? `${calendar.tonight.free} of ${calendar.tonight.total} free tonight` : "Loading…"}
      tabs={[
        {
          key: "overview", label: "Overview", render: () => bookings === null ? <Loading /> : (
            <>
              {notice && <div className={`portal-note ${notice.tone === "bad" ? "bad" : ""}`}>{notice.text}</div>}
              <div className="kpis">
                <Kpi value={`${calendar?.tonight.occupancyPct ?? 0}%`} label="Occupancy tonight" />
                <Kpi value={String(calendar?.tonight.free ?? 0)} label="Rooms free tonight" />
                <Kpi value={String(arrivals.length)} label="Arrivals today" />
                <Kpi value={money(revenue, currency)} label="Booked revenue" />
              </div>
              <h3 className="portal-h3">Arriving today</h3>
              {arrivals.length === 0
                ? <Empty icon="🛎️" title="No arrivals today" hint="Bookings for today will appear here." />
                : arrivals.map((b) => (
                  <div key={b.id} className="lrow">
                    <div style={{ flex: 1 }}>
                      <b>{b.guest.name}</b>
                      <span>{b.roomType?.name ?? b.listing?.title} · {b.nights} nights · {b.reference}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <b>{money(b.total, b.currency)}</b>
                      <div><BookingPill status={b.status} /></div>
                    </div>
                  </div>
                ))}
              {inHouse.length > 0 && (
                <>
                  <h3 className="portal-h3">In house</h3>
                  {inHouse.map((b) => (
                    <div key={b.id} className="lrow">
                      <div style={{ flex: 1 }}><b>{b.guest.name}</b><span>Leaves {shortDate(b.checkOut)}</span></div>
                      {canAt(PERMISSIONS.BOOKING_CHECKIN, b.property.id) && (
                        <button className="btn-mini" disabled={busy === b.id} onClick={() => act(b.id, "checkout")}>
                          Check out
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          ),
        },
        {
          key: "rooms", label: "Rooms & rates", render: () => rooms === null ? <Loading /> : rooms.length === 0 ? (
            <Empty icon="🏨" title="No room types yet"
              hint="Add one to start selling rooms. A whole-property listing does not need them." />
          ) : (
            <>
              {notice && <div className={`portal-note ${notice.tone === "bad" ? "bad" : ""}`}>{notice.text}</div>}
              <div className="portal-h3 row-between">
                <span>Room types &amp; rates</span>
                {canAt(PERMISSIONS.ROOMTYPE_MANAGE, rooms[0]?.propertyId) && (
                  <button className="btn-mini" onClick={addRoom}>+ Add room type</button>
                )}
              </div>
              {rooms.map((r) => (
                <div key={r.id} className="room-card">
                  <div className="room-top">
                    <b>{r.name}</b>
                    <span className="room-rate">{money(r.rate, r.currency)}<small>/night</small></span>
                  </div>
                  <div className="room-meta">
                    {r.beds ? `${r.beds} · ` : ""}{r.totalRooms} rooms · sleeps {r.maxGuests}
                    {r._count ? ` · ${r._count.bookings} bookings` : ""}
                    {!r.active && <span className="bad"> · inactive</span>}
                  </div>
                  <div className="room-acts">
                    {/* Hidden here, refused there. The API is the boundary; this
                        only avoids offering a button that would come back 403. */}
                    {canAt(PERMISSIONS.ROOMTYPE_MANAGE, r.propertyId) && (
                      <>
                        <button onClick={() => editRate(r)}>Edit rate</button>
                        <button onClick={() => editInventory(r)}>Set inventory</button>
                      </>
                    )}
                    {canAt(PERMISSIONS.AVAILABILITY_MANAGE, r.propertyId) && (
                      <button onClick={() => closeDates(r)}>Close dates</button>
                    )}
                  </div>
                </div>
              ))}
            </>
          ),
        },
        {
          key: "availability", label: "Availability", render: () => calendar === null ? <Loading /> : calendar.rows.length === 0 ? (
            <Empty icon="📅" title="Nothing to show" hint="Availability appears once you have room types." />
          ) : (
            <>
              <h3 className="portal-h3">Next {calendar.days.length} nights</h3>
              <div className="avail-legend">
                <span><i style={{ background: "#00c4ac" }} />Available</span>
                <span><i style={{ background: "#f5a623" }} />Limited</span>
                <span><i style={{ background: "#e0574a" }} />Full or closed</span>
              </div>
              {/* Scrolls sideways on a phone. Eight columns squeezed into 390px
                  is a grid nobody can read, and a front desk checks this on a
                  handset far more often than at a desk. */}
              <div className="avail-scroll">
              <div className="avail-grid" style={{ gridTemplateColumns: `1.4fr repeat(${calendar.days.length},1fr)` }}>
                <div className="avail-corner">Room</div>
                {calendar.days.map((d) => <div key={d} className="avail-day">{shortDate(d)}</div>)}
                {calendar.rows.map((row) => (
                  <CalendarRowCells key={row.roomTypeId} row={row} />
                ))}
              </div>
              </div>
              <div className="portal-note">
                These are the same figures the booking engine uses, so what you see here is what a guest can buy.
              </div>
            </>
          ),
        },
        {
          key: "bookings", label: "Bookings", render: () => bookings === null ? <Loading /> : bookings.length === 0 ? (
            <Empty icon="🛎️" title="No bookings yet" hint="Published listings appear on the marketplace." />
          ) : (
            <>
              {notice && <div className={`portal-note ${notice.tone === "bad" ? "bad" : ""}`}>{notice.text}</div>}
              {bookings.map((b) => (
                <div key={b.id} className="lrow">
                  <div className="lrow-av">{b.guest.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  <div style={{ flex: 1 }}>
                    <b>{b.guest.name}</b>
                    <span>
                      {b.roomType?.name ?? b.listing?.title} · {shortDate(b.checkIn)} → {shortDate(b.checkOut)}
                      {b.rooms > 1 ? ` · ${b.rooms} rooms` : ""} · {b.reference}
                    </span>
                    {b.cancelReason && <span className="bad">{b.cancelReason}</span>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <b>{money(b.total, b.currency)}</b>
                    <div><BookingPill status={b.status} /></div>
                    <div className="room-acts">
                      {b.status === "PENDING" && canAt(PERMISSIONS.BOOKING_CONFIRM, b.property.id) && (
                        <button disabled={busy === b.id} onClick={() => act(b.id, "confirm")}>Confirm</button>
                      )}
                      {b.status === "CONFIRMED" && canAt(PERMISSIONS.BOOKING_CHECKIN, b.property.id) && (
                        <button disabled={busy === b.id} onClick={() => act(b.id, "checkin")}>Check in</button>
                      )}
                      {b.status === "CHECKED_IN" && canAt(PERMISSIONS.BOOKING_CHECKIN, b.property.id) && (
                        <button disabled={busy === b.id} onClick={() => act(b.id, "checkout")}>Check out</button>
                      )}
                      {(b.status === "PENDING" || b.status === "CONFIRMED")
                        && canAt(PERMISSIONS.BOOKING_CANCEL, b.property.id) && (
                        <button disabled={busy === b.id} onClick={() => act(b.id, "cancel")}>Cancel</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}

function CalendarRowCells({ row }: { row: CalendarRow }) {
  return (
    <>
      <div className="avail-name">{row.name}</div>
      {row.nights.map((n) => {
        const cls = n.available === 0 ? "full" : n.available <= Math.max(1, Math.round(row.totalRooms * 0.2)) ? "limited" : "open";
        return (
          <div key={n.date} className={`avail-cell ${cls}`} title={n.blocked ? (n.reason ?? "Closed") : `${n.available} free`}>
            {n.blocked ? "—" : n.available}
          </div>
        );
      })}
    </>
  );
}

function BookingPill({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, { tone: "green" | "amber" | "red" | "blue" | "grey"; label: string }> = {
    PENDING: { tone: "amber", label: "Pending" },
    CONFIRMED: { tone: "blue", label: "Confirmed" },
    CHECKED_IN: { tone: "green", label: "In house" },
    COMPLETED: { tone: "grey", label: "Completed" },
    CANCELLED: { tone: "red", label: "Cancelled" },
    REFUNDED: { tone: "red", label: "Refunded" },
  };
  const m = map[status];
  return <Pill tone={m.tone}>{m.label}</Pill>;
}
