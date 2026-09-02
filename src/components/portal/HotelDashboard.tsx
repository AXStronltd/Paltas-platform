"use client";

import { useEffect, useState } from "react";
import type { HotelRoom, HotelBooking } from "@/lib/models";
import {
  getHotelRooms, getHotelBookings, updateRoomRate, updateRoomAvailability, addRoomType,
} from "@/lib/services/portalService";
import { PortalShell, Kpi, Pill, Loading, Empty } from "./PortalShell";

export function HotelDashboard() {
  const [rooms, setRooms] = useState<HotelRoom[] | null>(null);
  const [bookings, setBookings] = useState<HotelBooking[] | null>(null);

  async function loadRooms() { setRooms((await getHotelRooms()).data); }
  async function loadBookings() { setBookings((await getHotelBookings()).data); }
  useEffect(() => { loadRooms(); loadBookings(); }, []);

  const occupancy = rooms ? Math.round(((sum(rooms, "total") - sum(rooms, "available")) / Math.max(1, sum(rooms, "total"))) * 100) : 0;
  const available = rooms ? sum(rooms, "available") : 0;

  async function editRate(r: HotelRoom) {
    const v = prompt(`New nightly rate for ${r.name} (KSh):`, String(r.rate));
    if (v) { await updateRoomRate(r.id, parseInt(v) || r.rate); loadRooms(); }
  }
  async function setAvail(r: HotelRoom) {
    const v = prompt(`Rooms available for ${r.name}:`, String(r.available));
    if (v !== null) { await updateRoomAvailability(r.id, parseInt(v) || 0); loadRooms(); }
  }
  async function addRoom() {
    const name = prompt("New room type name:", "Superior Twin");
    if (!name) return;
    const rate = parseInt(prompt("Nightly rate (KSh):", "10000") || "10000") || 10000;
    const total = parseInt(prompt("How many rooms:", "10") || "10") || 10;
    await addRoomType({ name, rate, total, beds: "2 Twin" });
    loadRooms();
  }

  return (
    <PortalShell
      title="Sarova Grand Hotel" subtitle="Hotel management · Nairobi" badge="✓ Verified · Instant payout"
      tabs={[
        {
          key: "overview", label: "Overview", render: () => rooms === null || bookings === null ? <Loading /> : (
            <>
              <div className="kpis">
                <Kpi value={`${occupancy}%`} label="Occupancy" />
                <Kpi value={String(available)} label="Rooms available" />
                <Kpi value={String(bookings.filter((b) => b.status === "confirmed").length)} label="Arrivals today" />
                <Kpi value={`KSh ${Math.round(bookings.filter((b) => b.status !== "checked_out").reduce((a, b) => a + b.amount, 0) / 1000)}k`} label="Revenue (in-house)" />
              </div>
              <div className="portal-note">💡 Guests get instant confirmation when they book your rooms.</div>
              <h3 className="portal-h3">Today&apos;s arrivals</h3>
              {bookings.filter((b) => b.status === "confirmed").map((b) => (
                <div key={b.id} className="lrow"><div><b>{b.guest}</b><span>{b.room} · {b.checkIn} → {b.checkOut}</span></div><b>KSh {b.amount.toLocaleString()}</b></div>
              ))}
            </>
          ),
        },
        {
          key: "rooms", label: "Rooms & rates", render: () => rooms === null ? <Loading /> : (
            <>
              <div className="portal-h3 row-between"><span>Room types &amp; rates</span><button className="btn-mini" onClick={addRoom}>+ Add room type</button></div>
              {rooms.map((r) => (
                <div key={r.id} className="room-card">
                  <div className="room-top"><b>{r.name}</b><span className="room-rate">KSh {r.rate.toLocaleString()}<small>/night</small></span></div>
                  <div className="room-meta">{r.beds} · {r.total} rooms · <span className="ok">{r.available} available</span></div>
                  <div className="room-acts">
                    <button onClick={() => editRate(r)}>Edit rate</button>
                    <button onClick={() => setAvail(r)}>Set availability</button>
                  </div>
                </div>
              ))}
            </>
          ),
        },
        {
          key: "availability", label: "Availability", render: () => rooms === null ? <Loading /> : (
            <>
              <h3 className="portal-h3">Next 7 days</h3>
              <div className="avail-legend"><span><i style={{ background: "#00c4ac" }} />Available</span><span><i style={{ background: "#f5a623" }} />Limited</span><span><i style={{ background: "#e0574a" }} />Full</span></div>
              <div className="avail-grid" style={{ gridTemplateColumns: "1.4fr repeat(7,1fr)" }}>
                <div className="avail-corner">Room</div>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="avail-day">{d}</div>)}
                {rooms.map((r) => (
                  <FragmentRow key={r.id} room={r} />
                ))}
              </div>
            </>
          ),
        },
        {
          key: "bookings", label: "Bookings", render: () => bookings === null ? <Loading /> : bookings.length === 0 ? <Empty icon="🛎️" title="No bookings yet" /> : (
            <>
              {bookings.map((b) => (
                <div key={b.id} className="lrow">
                  <div className="lrow-av">{b.guest.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                  <div style={{ flex: 1 }}><b>{b.guest}</b><span>{b.room} · {b.checkIn} → {b.checkOut}</span></div>
                  <div style={{ textAlign: "right" }}>
                    <b>KSh {b.amount.toLocaleString()}</b>
                    <div><BookingPill status={b.status} /></div>
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

function FragmentRow({ room }: { room: HotelRoom }) {
  return (
    <>
      <div className="avail-name">{room.name}</div>
      {[0, 1, 2, 3, 4, 5, 6].map((di) => {
        const a = Math.max(0, room.available - (di % 3));
        const cls = a === 0 ? "full" : a <= 2 ? "limited" : "open";
        return <div key={di} className={`avail-cell ${cls}`}>{a}</div>;
      })}
    </>
  );
}

function BookingPill({ status }: { status: HotelBooking["status"] }) {
  const map: Record<HotelBooking["status"], { tone: "blue" | "green" | "grey" | "red"; label: string }> = {
    confirmed: { tone: "blue", label: "Confirmed" },
    checked_in: { tone: "green", label: "Checked in" },
    checked_out: { tone: "grey", label: "Checked out" },
    cancelled: { tone: "red", label: "Cancelled" },
  };
  const m = map[status];
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

function sum(rooms: HotelRoom[], k: "total" | "available") { return rooms.reduce((a, r) => a + r[k], 0); }
