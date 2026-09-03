import { MyBookings } from "@/components/booking/MyBookings";

/**
 * My bookings.
 *
 * The heading lives inside MyBookings rather than here, because this is a
 * server component and the translator is a client hook — a title rendered here
 * stayed in English while everything beneath it changed language.
 */
export default function BookingsPage() {
  return (
    <main className="container detail">
      <MyBookings />
    </main>
  );
}
