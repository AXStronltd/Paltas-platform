/**
 * Notifications, and whose they are.
 *
 * The property worth proving is not that one can be created. It is that a
 * notification is addressed to exactly one person, that nobody else can read
 * or clear it, and that an event delivered twice — which is what a payment
 * webhook does — records one notification rather than two.
 */
import { PrismaClient } from "@prisma/client";

const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const db = new PrismaClient();
let pass = 0, fail = 0;
const check = (ok, l, d = "") => { ok ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}  → ${d}`)); };

function client(cookie = "") {
  const call = async (m, p, b) => {
    const r = await fetch(BASE + p, {
      method: m,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(b ? { "Content-Type": "application/json" } : {}) },
      body: b ? JSON.stringify(b) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null),
             cookies: (r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; ") };
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b) };
}

const anon = client();
const stamp = Math.floor(Math.random() * 1e9);

async function guest(email) {
  const r = await anon.post("/guest/register", { email, name: "Notify Test", password: "a-long-password-1" });
  return { c: client(r.cookies), id: r.json?.guest?.id };
}

const alice = await guest(`n-alice${stamp}@example.com`);
const mallory = await guest(`n-mallory${stamp}@example.com`);

console.log("SIGNED OUT");
check((await anon.get("/notifications")).status === 401, "the feed refuses an anonymous caller");
check((await anon.post("/notifications", {})).status === 401, "and so does marking read");

console.log("\nA NOTIFICATION BELONGS TO ONE PERSON");
await db.notification.create({
  data: { guestId: alice.id, kind: "BOOKING", title: "Your booking is confirmed",
          body: "Test stay", href: "/bookings", entityId: `t${stamp}` },
});
const mine = await alice.c.get("/notifications");
check(mine.status === 200, "the owner can read it");
check(mine.json.notifications.some((n) => n.title === "Your booking is confirmed"), "and it is there");
check(mine.json.unread === 1, "counted as unread", `${mine.json.unread}`);

const theirs = await mallory.c.get("/notifications");
check(theirs.json.notifications.length === 0, "another guest sees nothing of it");
check(theirs.json.unread === 0, "and has no count from it");

console.log("\nTHE SAME EVENT TWICE IS ONE NOTIFICATION");
// What a retried Stripe webhook does.
for (let i = 0; i < 2; i++) {
  await db.notification.upsert({
    where: { guestId_kind_entityId: { guestId: alice.id, kind: "BOOKING", entityId: `dup${stamp}` } },
    update: {}, create: { guestId: alice.id, kind: "BOOKING", title: "Repeat", entityId: `dup${stamp}` },
  });
}
const after = await alice.c.get("/notifications");
check(after.json.notifications.filter((n) => n.title === "Repeat").length === 1,
  "recorded once, not twice", `${after.json.notifications.filter((n) => n.title === "Repeat").length}`);

console.log("\nMARKING READ IS SCOPED TO YOUR OWN");
const cleared = await mallory.c.post("/notifications", {});
check(cleared.json.read === 0, "clearing someone else's inbox clears nothing", `${cleared.json?.read}`);
check((await alice.c.get("/notifications")).json.unread === 2, "the owner's count is untouched",
  `${(await alice.c.get("/notifications")).json.unread}`);

const own = await alice.c.post("/notifications", {});
check(own.json.read === 2, "the owner clears their own", `${own.json?.read}`);
check((await alice.c.get("/notifications")).json.unread === 0, "and the badge is empty");
check((await alice.c.post("/notifications", {})).json.read === 0, "clearing twice changes nothing");

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
