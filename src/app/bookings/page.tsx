import { MyBookings } from "@/components/booking/MyBookings";

/**
 * My bookings page — the end of the journey. Shows the guest's confirmed
 * bookings and lets them confirm their stay (two-sided completion).
 */
export default function BookingsPage() {
  return (
    <main className="container" style={{ paddingTop: 32, paddingBottom: 60 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.5px", marginBottom: 6 }}>
        My bookings
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 22 }}>
        Your confirmed bookings and stays.
      </p>
      <MyBookings />
    </main>
  );
}
