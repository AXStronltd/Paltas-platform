/**
 * The whole trip in one booking, end to end.
 *
 * This is the differentiator: a bed, a way in from the airport, and a cleaner,
 * bought together and paid for once. The tests are mostly about money — that
 * prices come from the host's row and never the caller, that the four pricing
 * models are applied correctly, and that the platform does not quietly take a
 * cut of a guest's taxi.
 */
const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
let pass = 0, fail = 0;
const check = (ok, l, d = "") => { ok ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  → ${d}`)); };

function client(cookie = "") {
  const call = async (m, p, b) => {
    const r = await fetch(BASE + p, {
      method: m,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(b ? { "Content-Type": "application/json" } : {}) },
      body: b ? JSON.stringify(b) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b),
           patch: (p, b) => call("PATCH", p, b), del: (p) => call("DELETE", p) };
}
async function staff(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: P }),
  });
  return client((r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; "));
}
async function guest() {
  const email = `trip${Math.floor(Math.random() * 1e9)}@example.com`;
  const r = await fetch(`${BASE}/guest/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: "Trip Tester", password: "a-really-long-password" }),
  });
  return client((r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; "));
}
const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const anon = client();

console.log("THE SHOPFRONT OFFERS THE WHOLE TRIP");
const feed = await anon.get("/public/listings?kind=STAY");
const hotel = feed.json.listings.find((l) => l.title.includes("Nyali"));
const detail = await anon.get(`/public/listings/${hotel.id}`);
const services = detail.json.listing.services;
check(services.length >= 4, "the listing advertises services alongside the room", `${services?.length}`);
check(services.some((s) => s.kind === "AIRPORT_TRANSFER"), "including an airport transfer");
check(services.some((s) => s.kind === "CLEANING"), "and a clean");
check(services.some((s) => s.providerName), "saying who provides it — a fair question");
// Organisation-wide and property-specific offerings must both appear.
check(services.some((s) => s.kind === "DRIVER") && services.some((s) => s.kind === "BREAKFAST"),
  "org-wide and property-specific services both show");

const blob = JSON.stringify(detail.json);
check(!blob.includes("orgId") && !blob.includes("propertyId"),
  "and no tenant or internal ids leak, even though the query needed them");

const transfer = services.find((s) => s.kind === "AIRPORT_TRANSFER");
const driver = services.find((s) => s.kind === "DRIVER");
const breakfast = services.find((s) => s.kind === "BREAKFAST");
const rt = detail.json.listing.roomTypes[0];

console.log("\nONE QUOTE FOR THE WHOLE TRIP");
const ci = day(40), co = day(44);
const plain = await anon.get(`/public/listings/${hotel.id}/quote?checkIn=${ci}&checkOut=${co}&roomTypeId=${rt.id}&guests=2`);
const bundled = await anon.get(
  `/public/listings/${hotel.id}/quote?checkIn=${ci}&checkOut=${co}&roomTypeId=${rt.id}&guests=2`
  + `&addon=${transfer.id}:2&addon=${driver.id}&addon=${breakfast.id}`);
check(bundled.status === 200, "a bundled quote is returned", JSON.stringify(bundled.json?.error));
const q = bundled.json.quote;
check(q.addons.length === 3, "with each service itemised", `${q.addons?.length}`);
check(q.addonsTotal > 0, "and a services total");

// The four pricing models, checked against the seeded prices.
const nights = q.nights;
const byName = Object.fromEntries(q.addons.map((a) => [a.name, a]));
check(byName["Airport pickup"].amount === transfer.price * 2,
  "a flat-priced transfer × 2 is twice the price, not twice the nights", `${byName["Airport pickup"]?.amount}`);
check(byName["Driver and car, per day"].amount === driver.price * nights,
  "a per-night driver multiplies by nights", `${byName["Driver and car, per day"]?.amount}`);
check(byName["Breakfast"].amount === breakfast.price * nights * 2,
  "breakfast is per person per morning", `${byName["Breakfast"]?.amount}`);
check(q.addons.every((a) => Number.isInteger(a.amount)), "every figure is a whole unit");

console.log("\nTHE PLATFORM DOES NOT TAKE A CUT OF THE GUEST'S TAXI");
check(bundled.json.quote.serviceFee === plain.json.quote.serviceFee,
  "the platform fee is identical with and without services",
  `${bundled.json.quote.serviceFee} vs ${plain.json.quote.serviceFee}`);
check(q.total > plain.json.quote.total, "but the total is higher");
check(q.total === q.subtotal + q.cleaningFee + q.serviceFee + q.addonsTotal - q.discountAmount + q.taxes,
  "and the total is exactly the sum of its parts");

console.log("\nBOOKING IT IS ONE TRANSACTION");
const g = await guest();
const key = `trip-${Math.floor(Math.random() * 1e10)}`;
const booked = await g.post("/bookings", {
  listingId: hotel.id, roomTypeId: rt.id, checkIn: ci, checkOut: co, guests: 2, rooms: 1,
  idempotencyKey: key,
  addons: [
    { offeringId: transfer.id, quantity: 2, note: "Flight KQ100, 06:40" },
    { offeringId: breakfast.id },
  ],
});
check(booked.status === 201, "a stay and its services book together", JSON.stringify(booked.json?.error));
const b = booked.json.booking;
check(b.addonsTotal === transfer.price * 2 + breakfast.price * nights * 2,
  "the services are on the booking at the right price", `${b.addonsTotal}`);
check(b.total > b.subtotal, "and in one total the guest pays once");

console.log("\nTHE PRICE COMES FROM THE HOST, NEVER THE CALLER");
const cheeky = await g.post("/bookings", {
  listingId: hotel.id, roomTypeId: rt.id, checkIn: day(50), checkOut: day(52), guests: 2, rooms: 1,
  idempotencyKey: `trip-${Math.floor(Math.random() * 1e10)}`,
  addons: [{ offeringId: transfer.id, quantity: 1, unitPrice: 1, amount: 1, name: "Free ride" }],
});
check(cheeky.status === 201 && cheeky.json.booking.addonsTotal === transfer.price,
  "a client-supplied add-on price is ignored", `${cheeky.json.booking?.addonsTotal}`);

console.log("\nWHAT CANNOT BE BOOKED");
const other = detail.json.listing.id;
const bad = await g.post("/bookings", {
  listingId: other, roomTypeId: rt.id, checkIn: day(60), checkOut: day(62), guests: 2, rooms: 1,
  idempotencyKey: `trip-${Math.floor(Math.random() * 1e10)}`,
  addons: [{ offeringId: "not-a-real-service" }],
});
check(bad.status === 400, "an unknown service is refused, not silently dropped", `${bad.status}`);

// A service belonging to another organisation must not attach to this booking.
const salim = await staff("owner@coastalliving.co.ke");
const theirs = await salim.post("/services", {
  kind: "CLEANING", name: "Coastal clean", price: 100, currency: "KES", pricing: "FLAT",
});
if (theirs.status === 201) {
  const cross = await g.post("/bookings", {
    listingId: hotel.id, roomTypeId: rt.id, checkIn: day(70), checkOut: day(72), guests: 2, rooms: 1,
    idempotencyKey: `trip-${Math.floor(Math.random() * 1e10)}`,
    addons: [{ offeringId: theirs.json.service.id }],
  });
  check(cross.status === 400, "and so is another host's service, however cheap", `${cross.status}`);
}

console.log("\nTHE HOST ARRANGES IT");
const mgr = await staff("joseph.kamau@paltas.co.ke");
const hassan = await staff("hassan.omar@paltas.co.ke");
const guard = await staff("john.mutiso@paltas.co.ke");

check((await guard.post("/services", { kind: "TOUR", name: "X", price: 100 })).status === 403,
  "a guard cannot invent services");
const listed = await hassan.get("/services");
check(listed.status === 200 && listed.json.services.length >= 4, "the manager sees the catalogue",
  `${listed.json.services?.length}`);
check((await hassan.post("/services", { kind: "TOUR", name: "Free tour", price: 0 })).status === 400,
  "a service priced at zero is refused, not defaulted");

const full = await g.get(`/bookings/${b.id}`);
check(full.status === 200, "the guest can see their booking");

const board = await hassan.get("/host/bookings");
check(board.status === 200, "and the host sees it on the arrivals board");

console.log("\nTHE HOST ARRANGES WHAT THE GUEST BOOKED");
const mine = (await g.get(`/bookings/${b.id}`)).json.booking;
check(mine.addons.length === 2, "the guest sees both services on their booking", `${mine.addons?.length}`);
check(mine.addons.every((a) => a.status === "REQUESTED"), "awaiting the host arranging them");
const flight = mine.addons.find((a) => a.kind === "AIRPORT_TRANSFER");
check(flight.note === "Flight KQ100, 06:40", "with the flight number the guest gave", flight?.note);

const onBoard = (await hassan.get("/host/bookings")).json.bookings.find((x) => x.id === b.id);
check(onBoard?.addons?.length === 2, "and the host sees them on the arrivals board");

check((await guard.patch(`/host/addons/${flight.id}`, { action: "confirm" })).status === 403,
  "a guard at another property cannot confirm it");
const confirmed = await hassan.patch(`/host/addons/${flight.id}`, { action: "confirm" });
check(confirmed.status === 200 && confirmed.json.addon.status === "CONFIRMED",
  "the manager confirms the transfer", `${confirmed.status}`);
check((await hassan.patch(`/host/addons/${flight.id}`, { action: "confirm" })).status === 409,
  "and cannot confirm it twice");

const noReason = await hassan.patch(`/host/addons/${flight.id}`, { action: "cancel" });
check(noReason.status === 400, "cancelling a paid-for service requires a reason", `${noReason.status}`);

const delivered = await hassan.patch(`/host/addons/${flight.id}`, { action: "deliver" });
check(delivered.status === 200 && delivered.json.addon.status === "DELIVERED", "and can mark it delivered");

const timeline = (await g.get(`/bookings/${b.id}`)).json.booking.events.map((e) => e.note);
check(timeline.some((n) => /Confirmed: Airport pickup/.test(n)),
  "the guest's timeline shows the whole trip, not just the room", timeline.join(" | "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
