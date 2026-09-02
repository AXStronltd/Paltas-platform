/**
 * Bookings, end to end, against a live server and a real database.
 *
 * The pure suite proves the availability arithmetic is right. This one proves
 * the things arithmetic cannot: that a guest session is not a staff session,
 * that one guest cannot read another's booking, that a retried request does not
 * charge twice, and that two simultaneous requests for the last room produce
 * one booking and one refusal.
 */
const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
let pass = 0, fail = 0;
const check = (ok, l, d = "") => { ok ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  → ${d}`)); };

const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function client(cookie = "") {
  const call = async (m, p, b) => {
    const r = await fetch(BASE + p, {
      method: m,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(b ? { "Content-Type": "application/json" } : {}) },
      body: b ? JSON.stringify(b) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null), raw: r };
  };
  return {
    get: (p) => call("GET", p), post: (p, b) => call("POST", p, b),
    patch: (p, b) => call("PATCH", p, b), del: (p) => call("DELETE", p),
  };
}

async function staff(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: P }),
  });
  return client((r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; "));
}

async function guest(email, name) {
  let r = await fetch(`${BASE}/guest/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: P }),
  });
  if (r.status !== 200) {
    r = await fetch(`${BASE}/guest/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password: P }),
    });
  }
  return {
    ...client((r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; ")),
    cookie: (r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; "),
  };
}

console.log("PUBLIC SHOPFRONT");
const anon = client();
const feed = await anon.get("/public/listings?kind=STAY");
const hotel = feed.json.listings.find((l) => l.title.includes("Nyali Court"));
check(feed.status === 200 && !!hotel, "the hotel appears in the public STAY feed");

const detail = await anon.get(`/public/listings/${hotel.id}`);
check(detail.status === 200, "its detail page is readable without signing in");
check(detail.json.listing.roomTypes.length === 2, "with both room types", `${detail.json.listing.roomTypes?.length}`);
const garden = detail.json.listing.roomTypes.find((r) => r.name === "Garden double");
const suite = detail.json.listing.roomTypes.find((r) => r.name === "Sea-view suite");
check(garden.totalRooms === 12 && suite.totalRooms === 4, "with their real inventory");
const blob = JSON.stringify(detail.json);
check(!blob.includes("orgId") && !blob.includes("createdById"), "and no tenant or internal ids leak");

const draft = await anon.get(`/public/listings/${(await staff("owner@coastalliving.co.ke")).x ?? "nonexistent"}`);
check(draft.status === 404, "an unknown listing is a flat 404");

console.log("\nQUOTES");
const q = await anon.get(`/public/listings/${hotel.id}/quote?checkIn=${day(30)}&checkOut=${day(33)}&roomTypeId=${garden.id}`);
check(q.status === 200 && q.json.available, "a free window quotes as available");
check(q.json.quote.nights === 3, "three nights", `${q.json.quote?.nights}`);
check(q.json.quote.subtotal === 9500 * 3, "priced from the room type, not the listing", `${q.json.quote?.subtotal}`);
check(q.json.quote.total === q.json.quote.subtotal + q.json.quote.serviceFee + q.json.quote.taxes,
  "and the total is the sum of its parts", JSON.stringify(q.json.quote));
check(q.json.provisional === true, "the quote says of itself that it is provisional");

const backwards = await anon.get(`/public/listings/${hotel.id}/quote?checkIn=${day(33)}&checkOut=${day(30)}`);
check(backwards.status === 400, "a backwards range is refused");
const past = await anon.get(`/public/listings/${hotel.id}/quote?checkIn=${day(-10)}&checkOut=${day(-5)}`);
check(past.status === 400, "and so is one in the past");

// The seed blocks days 120-127 for pool resurfacing.
const blocked = await anon.get(`/public/listings/${hotel.id}/quote?checkIn=${day(121)}&checkOut=${day(124)}&roomTypeId=${garden.id}`);
check(blocked.status === 200 && !blocked.json.available, "blocked dates quote as unavailable", JSON.stringify(blocked.json));

console.log("\nGUEST IDENTITY IS NOT STAFF IDENTITY");
const fatuma = await guest("guest@example.com", "Fatuma Njeri");
const other = await guest("other.guest@example.com", "Other Guest");

const me = await fatuma.get("/guest/me");
check(me.status === 200 && me.json.guest?.email === "guest@example.com", "a guest can read their own identity");

// The whole point of a separate session table: a leaked guest cookie must be
// worth nothing on the staff side.
const asStaff = client(fatuma.cookie);
check((await asStaff.get("/properties")).status === 401, "a guest cookie cannot read properties");
check((await asStaff.get("/host/bookings")).status === 401, "nor the host's arrivals board");
check((await asStaff.get("/staff")).status === 401, "nor the staff directory");
check((await asStaff.get("/me")).status === 401, "and it is not a staff identity at all");

const guard = await staff("john.mutiso@paltas.co.ke");
check((await guard.get("/bookings")).status === 401, "and a staff cookie is not a guest session either");

console.log("\nBOOKING");
const unauth = await anon.post("/bookings", { listingId: hotel.id, checkIn: day(40), checkOut: day(42), idempotencyKey: "anon-key-1" });
check(unauth.status === 401, "booking requires signing in");

const noKey = await fatuma.post("/bookings", { listingId: hotel.id, checkIn: day(40), checkOut: day(42) });
check(noKey.status === 400 && /idempotency/i.test(noKey.json?.error?.message ?? ""),
  "and an idempotency key, or a double tap becomes a double booking", noKey.json?.error?.message);

const key1 = `e2e-${Date.now()}-a`;
const b1 = await fatuma.post("/bookings", {
  listingId: hotel.id, roomTypeId: garden.id, checkIn: day(40), checkOut: day(42),
  guests: 2, rooms: 1, idempotencyKey: key1,
});
check(b1.status === 201, "a valid booking is created", JSON.stringify(b1.json?.error));
check(b1.json.booking.status === "PENDING", "as PENDING — payment has not happened yet", b1.json.booking?.status);
check(/^PLT-/.test(b1.json.booking.reference), "with a readable reference", b1.json.booking?.reference);
check(b1.json.booking.total === b1.json.booking.subtotal + b1.json.booking.serviceFee + b1.json.booking.taxes,
  "and a total computed on the server");

// The price must come from the listing, never from the request.
const cheeky = await fatuma.post("/bookings", {
  listingId: hotel.id, roomTypeId: garden.id, checkIn: day(50), checkOut: day(52),
  guests: 2, rooms: 1, total: 1, nightlyRate: 1, subtotal: 1, idempotencyKey: `e2e-${Date.now()}-cheeky`,
});
check(cheeky.status === 201 && cheeky.json.booking.nightlyRate === 9500,
  "a client-supplied price is ignored — the server prices it", `${cheeky.json.booking?.nightlyRate}`);

console.log("\nIDEMPOTENCY");
const replay = await fatuma.post("/bookings", {
  listingId: hotel.id, roomTypeId: garden.id, checkIn: day(40), checkOut: day(42),
  guests: 2, rooms: 1, idempotencyKey: key1,
});
check(replay.status === 200, "a replayed request answers 200, not 201", `${replay.status}`);
check(replay.json.reused === true, "and says it reused the original");
check(replay.json.booking.id === b1.json.booking.id, "returning the same booking, not a second one");

console.log("\nOVERBOOKING");
// The suite has 4 rooms. Take all of them, then try for a fifth.
const takeAll = await fatuma.post("/bookings", {
  listingId: hotel.id, roomTypeId: suite.id, checkIn: day(60), checkOut: day(63),
  guests: 4, rooms: 4, idempotencyKey: `e2e-${Date.now()}-suite`,
});
check(takeAll.status === 201, "all four suites can be taken at once", JSON.stringify(takeAll.json?.error));

const fifth = await other.post("/bookings", {
  listingId: hotel.id, roomTypeId: suite.id, checkIn: day(61), checkOut: day(62),
  guests: 2, rooms: 1, idempotencyKey: `e2e-${Date.now()}-fifth`,
});
check(fifth.status === 409, "a fifth is refused", `${fifth.status} ${JSON.stringify(fifth.json?.error)}`);
check(/fully booked/i.test(fifth.json?.error?.message ?? ""), "and says why in plain words", fifth.json?.error?.message);

// Check-out day is free: arriving the day the others leave must work.
const backToBack = await other.post("/bookings", {
  listingId: hotel.id, roomTypeId: suite.id, checkIn: day(63), checkOut: day(65),
  guests: 2, rooms: 1, idempotencyKey: `e2e-${Date.now()}-b2b`,
});
check(backToBack.status === 201, "but arriving the day they leave is fine", JSON.stringify(backToBack.json?.error));

// Two simultaneous requests for the same last room.
const raceKeys = [`e2e-${Date.now()}-r1`, `e2e-${Date.now()}-r2`];
const [r1, r2] = await Promise.all(raceKeys.map((k, i) =>
  (i === 0 ? fatuma : other).post("/bookings", {
    listingId: hotel.id, roomTypeId: suite.id, checkIn: day(70), checkOut: day(72),
    guests: 2, rooms: 4, idempotencyKey: k,
  })));
const created = [r1, r2].filter((r) => r.status === 201).length;
check(created === 1, "two simultaneous requests for the last rooms produce exactly one booking",
  `${r1.status} / ${r2.status}`);

console.log("\nA GUEST SEES ONLY THEIR OWN");
const mine = await fatuma.get("/bookings");
check(mine.status === 200, "a guest can list their bookings");
check(mine.json.bookings.every((b) => b.id !== backToBack.json.booking.id),
  "and the other guest's booking is not among them");
const peek = await fatuma.get(`/bookings/${backToBack.json.booking.id}`);
check(peek.status === 404, "reading it directly is a 404, not a 403 — ids are not confirmed", `${peek.status}`);
const peekCancel = await fatuma.post(`/bookings/${backToBack.json.booking.id}/cancel`, { reason: "not mine" });
check(peekCancel.status === 404, "and neither is cancelling it");

const own = await fatuma.get(`/bookings/${b1.json.booking.id}`);
check(own.status === 200 && own.json.booking.events.length >= 1, "their own booking reads, with its history");

console.log("\nCANCELLATION RELEASES INVENTORY");
const beforeCancel = await anon.get(`/public/listings/${hotel.id}/quote?checkIn=${day(61)}&checkOut=${day(62)}&roomTypeId=${suite.id}`);
check(beforeCancel.json.roomsLeft === 0, "the suite is fully booked", `${beforeCancel.json?.roomsLeft}`);
const cancelled = await fatuma.post(`/bookings/${takeAll.json.booking.id}/cancel`, { reason: "Plans changed." });
check(cancelled.status === 200, "the guest can cancel their own booking");
const afterCancel = await anon.get(`/public/listings/${hotel.id}/quote?checkIn=${day(61)}&checkOut=${day(62)}&roomTypeId=${suite.id}`);
check(afterCancel.json.roomsLeft === 4, "and the rooms go back on sale", `${afterCancel.json?.roomsLeft}`);

console.log("\nTHE HOST DESK");
const mgr = await staff("joseph.kamau@paltas.co.ke");   // Kilimani only
const hassan = await staff("hassan.omar@paltas.co.ke"); // Nyali Court — where the hotel is
const owner = await staff("owner@paltas.co.ke");
const accountant = await staff("david.omondi@paltas.co.ke"); // whole organisation, finance only
const salim = await staff("owner@coastalliving.co.ke");      // the other tenant

const board = await hassan.get("/host/bookings");
check(board.status === 200 && board.json.bookings.length > 0,
  "the hotel's manager sees the arrivals board", `${board.status} ${board.json?.bookings?.length}`);
check(board.json.revenue > 0, "with revenue on it", `${board.json?.revenue}`);
check(board.json.bookings.every((b) => b.property.name.includes("Nyali")), "and only their property's bookings");

// Isolation *within* one tenant: Joseph manages Kilimani, so the hotel's
// bookings are none of his business even though it is the same organisation.
const kilimani = await mgr.get("/host/bookings");
check(kilimani.status === 200 && kilimani.json.bookings.length === 0,
  "the manager of another property in the same organisation sees none of them",
  `${kilimani.json?.bookings?.length}`);
check((await guard.get("/host/bookings")).json.bookings.length === 0,
  "and neither does a guard posted to that other property");

check((await owner.get("/host/bookings")).json.bookings.length > 0, "the owner sees the whole organisation's");
check((await salim.get("/host/bookings")).json.bookings.length === 0, "the other tenant's owner sees nothing");

const cancelledOnBoard = board.json.bookings.filter((b) => b.status === "CANCELLED");
check(board.json.revenue === board.json.bookings.filter((b) => b.status !== "CANCELLED" && b.status !== "REFUNDED")
  .reduce((t, b) => t + b.total, 0), "and cancelled bookings are excluded from the revenue figure",
  `${cancelledOnBoard.length} cancelled`);

console.log("\nBOOKING LIFECYCLE");
const target = board.json.bookings.find((b) => b.status === "PENDING");
check(!!target, "there is a pending booking to work with");

const badMove = await hassan.patch(`/host/bookings/${target.id}`, { action: "checkout" });
check(badMove.status === 409, "a booking cannot skip states", `${badMove.status}`);
check((await hassan.patch(`/host/bookings/${target.id}`, { action: "teleport" })).status === 400,
  "and an invented action is refused outright");

// The accountant can see this booking — their scope is the whole organisation —
// so this refusal is about permission alone, not about reach.
const accountantSees = await accountant.get("/host/bookings");
check(accountantSees.json.bookings.some((b) => b.id === target.id), "the accountant can see the booking");
check((await accountant.patch(`/host/bookings/${target.id}`, { action: "confirm" })).status === 403,
  "but cannot confirm it — booking.view does not imply booking.confirm");

// The guard's reach stops at Kilimani, so this is the property boundary.
check((await guard.patch(`/host/bookings/${target.id}`, { action: "confirm" })).status === 403,
  "and a guard at another property cannot touch it at all");

const confirmed = await hassan.patch(`/host/bookings/${target.id}`, { action: "confirm" });
check(confirmed.status === 200 && confirmed.json.booking.status === "CONFIRMED",
  "the hotel's manager can confirm it", `${confirmed.status} ${confirmed.json?.booking?.status}`);
check(!!confirmed.json.booking.confirmedAt, "and the moment is stamped");
check((await hassan.patch(`/host/bookings/${target.id}`, { action: "confirm" })).status === 409,
  "confirming twice is refused");

check((await hassan.patch(`/host/bookings/${target.id}`, { action: "cancel" })).status === 400,
  "cancelling someone's stay requires a reason");
check((await hassan.patch(`/host/bookings/${target.id}`, { action: "checkin" })).status === 200,
  "a confirmed guest can be checked in");
check((await hassan.patch(`/host/bookings/${target.id}`, { action: "cancel", reason: "too late" })).status === 409,
  "and a guest already in the room cannot be cancelled out from under them");

console.log("\nROOM TYPES AND AVAILABILITY");
const nyaliProp = (await hassan.get("/properties")).json.properties[0];
check((await accountant.post("/roomtypes", { propertyId: nyaliProp.id, name: "y", rate: 1, totalRooms: 1 })).status === 403,
  "an accountant cannot invent room types");
const rt = await hassan.post("/roomtypes", {
  propertyId: nyaliProp.id, name: "Family room", rate: 14000, totalRooms: 3, maxGuests: 5,
});
check(rt.status === 201, "the property manager can add a room type", JSON.stringify(rt.json?.error));
check((await hassan.post("/roomtypes", { propertyId: nyaliProp.id, name: "Bad", rate: -1, totalRooms: 2 })).status === 400,
  "a negative rate is refused, not clamped");
check((await hassan.post("/roomtypes", { propertyId: nyaliProp.id, name: "Bad", rate: 100, totalRooms: 0 })).status === 400,
  "and so is inventory of zero");
// 404, not 403: telling the other tenant "forbidden" would confirm the room
// type exists. Across an organisation boundary the answer is that there is
// nothing there.
const crossTenant = await salim.patch(`/roomtypes/${rt.json.roomType.id}`, { rate: 1 });
check(crossTenant.status === 404, "the other tenant gets a flat 404, not a hint that it exists", `${crossTenant.status}`);
check((await salim.get("/roomtypes")).json.roomTypes.length === 0, "and sees no room types of ours at all");

const blk = await hassan.post("/availability", {
  propertyId: nyaliProp.id, from: day(200), to: day(203), reason: "Owner staying",
});
check(blk.status === 201, "dates can be withheld from sale", JSON.stringify(blk.json?.error));
check((await hassan.post("/availability", { propertyId: nyaliProp.id, from: day(200), to: day(203) })).status === 400,
  "but never without a reason");
check((await guard.post("/availability", { propertyId: nyaliProp.id, from: day(210), to: day(211), reason: "x" })).status === 403,
  "and a guard cannot withhold them");

console.log("\nMAINTENANCE");
// maintenance.resolve is deliberately distinct from maintenance.update: a
// contractor may post progress without being able to declare a job finished.
const tickets = (await mgr.get("/maintenance")).json.requests;
const open = tickets.find((t) => t.status === "OPEN");
check(!!open, "there is an open request to work with");

check((await mgr.patch(`/maintenance/${open.id}`, { status: "IN_PROGRESS" })).status === 200,
  "a manager can start a request");
const resolved = await mgr.patch(`/maintenance/${open.id}`, { status: "RESOLVED", note: "Replaced the relay." });
check(resolved.status === 200, "and resolve it with a note", JSON.stringify(resolved.json?.error));
check(!!resolved.json.request.resolvedAt, "which stamps the moment");
check(resolved.json.request.resolutionNote === "Replaced the relay.", "and records what was done");

// Reopening must clear the stamp, or the row reads as finished while open.
const reopened = await mgr.patch(`/maintenance/${open.id}`, { status: "OPEN" });
check(reopened.json.request.resolvedAt === null, "reopening clears the resolved date",
  `${reopened.json?.request?.resolvedAt}`);

check((await accountant.patch(`/maintenance/${open.id}`, { status: "RESOLVED" })).status === 403,
  "an accountant cannot resolve maintenance");
check((await mgr.patch(`/maintenance/${open.id}`, { assignedToId: "not-a-real-user" })).status === 400,
  "and a request cannot be parked on someone who does not exist");
check((await salim.patch(`/maintenance/${open.id}`, { status: "RESOLVED" })).status === 404,
  "the other tenant gets a flat 404");

console.log("\nPAYING FOR YOUR OWN BOOKING");
// The staff payment endpoint is behind payment.intent.create, which a guest
// will never hold. This is their own path, authorised by owning the booking.
const payable = await fatuma.post("/bookings", {
  listingId: hotel.id, roomTypeId: garden.id, checkIn: day(90), checkOut: day(92),
  guests: 2, rooms: 1, idempotencyKey: `e2e-${Date.now()}-pay`,
});
check(payable.status === 201, "a booking to pay for");

const anonPay = await anon.post(`/bookings/${payable.json.booking.id}/pay`);
check(anonPay.status === 401, "paying requires a session");
const otherPay = await other.post(`/bookings/${payable.json.booking.id}/pay`);
check(otherPay.status === 404, "another guest cannot pay for — or discover — your booking", `${otherPay.status}`);

// Stripe is unconfigured in CI, so 503 is the honest answer. What matters is
// that it comes *after* authorisation: an unauthorised caller must not learn
// how this platform takes money.
const ownPay = await fatuma.post(`/bookings/${payable.json.booking.id}/pay`);
check(ownPay.status === 503 || ownPay.status === 200,
  "the owner gets a real answer, not a refusal", `${ownPay.status}`);
check(otherPay.status === 404 && ownPay.status !== 404,
  "and the config state is only revealed to the booking's owner");

const cancelledForPay = await fatuma.post(`/bookings/${payable.json.booking.id}/cancel`, { reason: "test" });
check(cancelledForPay.status === 200, "cancelling it");
check((await fatuma.post(`/bookings/${payable.json.booking.id}/pay`)).status === 409,
  "a cancelled booking cannot be paid for");

console.log("\nTHE GUEST'S OWN VIEW");
const listedIds = (await fatuma.get("/bookings")).json.bookings.map((b) => b.id);
check(listedIds.includes(b1.json.booking.id), "their bookings list contains their booking");
check(!listedIds.includes(backToBack.json.booking.id), "and not the other guest's");
const blob2 = JSON.stringify((await fatuma.get("/bookings")).json);
check(!blob2.includes("orgId") && !blob2.includes("idempotencyKey"),
  "and leaks no tenant ids or idempotency keys");

console.log("\nTHE TRAIL");
const trail = await owner.get("/audit?limit=200");
const actions = (trail.json.entries ?? trail.json.logs ?? []).map((e) => e.action);
check(actions.includes("booking.confirm"), "confirming a booking is recorded", actions.slice(0, 8).join(","));
check(actions.includes("roomtype.create"), "so is creating a room type");
check(actions.includes("availability.block"), "and withholding dates");
check(actions.includes("maintenance.resolve"), "and resolving a maintenance request");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
