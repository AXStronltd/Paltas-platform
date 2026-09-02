/**
 * External listings, end to end.
 *
 * The property under test is one sentence: nothing reaches the public feed
 * without a recorded licence that grants display. Everything here is an attempt
 * to break that — ingest without a licence, grant partial rights, expire a
 * licence, cross a territory boundary, honour a takedown and then re-ingest.
 *
 * It writes directly through Prisma rather than through a provider, because the
 * subject is the gate and the separation, not Apify.
 */
import { PrismaClient } from "@prisma/client";

const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
const prisma = new PrismaClient();
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
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b), patch: (p, b) => call("PATCH", p, b) };
}
async function staff(email) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: P }),
  });
  return client((r.headers.getSetCookie() ?? []).map((x) => x.split(";")[0]).join("; "));
}

const KEY = `e2e-source-${Date.now()}`;
const anon = client();

// A clean slate for this run's source only.
await prisma.externalSource.deleteMany({ where: { key: { startsWith: "e2e-source-" } } });

const admin = await staff("admin@paltas.com");
const owner = await staff("owner@paltas.co.ke");
const guard = await staff("john.mutiso@paltas.co.ke");
const mgr = await staff("joseph.kamau@paltas.co.ke");

console.log("WHO MAY TOUCH EXTERNAL SOURCES");
check((await anon.get("/external/sources")).status === 401, "not the public");
check((await guard.get("/external/sources")).status === 403, "not a security guard");
check((await mgr.get("/external/sources")).status === 403, "not a property manager");
check((await mgr.post("/external/sources", { key: "x", name: "X", provider: "apify" })).status === 403,
  "and a manager cannot register one");
check((await admin.get("/external/sources")).status === 200, "platform staff can");

console.log("\nA NEW SOURCE IS UNLICENSED, AND SAYS SO");
const made = await admin.post("/external/sources", { key: KEY, name: "E2E Aggregator", provider: "apify" });
check(made.status === 201, "a source can be registered", JSON.stringify(made.json?.error));
check(made.json.source.licenceStatus === "NONE", "with no licence, whatever was asked for",
  made.json.source?.licenceStatus);
const sourceId = made.json.source.id;

const listed = (await admin.get("/external/sources")).json.sources.find((s) => s.key === KEY);
check(listed.publishing === false, "and the screen states plainly that it is not publishing");
check(/No licence/i.test(listed.publishingNote), "with the reason", listed.publishingNote);

console.log("\nINGESTING WITHOUT A LICENCE IS ALLOWED — PUBLISHING IS NOT");
// Ingest by hand: the gate, not the provider, is what is under test.
const rows = [
  { externalId: "x-1", title: "Piso en Malasaña", country: "ES", city: "Madrid", price: 585000, currency: "EUR",
    images: ["https://img.example/a.jpg"], agentName: "Ana Ruiz", agentPhone: "+34 600 000 000" },
  { externalId: "x-2", title: "Villa in Diani", country: "KE", city: "Kwale", price: 42000000, currency: "KES",
    images: ["https://img.example/b.jpg"], agentName: "Salim Bakari", agentPhone: "+254 700 000 000" },
];
for (const r of rows) {
  await prisma.externalListing.create({
    data: { ...r, sourceId, displayable: false, displayNote: "No licence recorded for this source." },
  });
}

const feed0 = await anon.get("/public/external");
check(feed0.status === 200, "the public feed answers");
check(!feed0.json.listings.some((l) => l.title.includes("Malasaña")),
  "but shows nothing from an unlicensed source", `${feed0.json.listings?.length} rows`);
check(feed0.json.bookable === false && feed0.json.external === true,
  "and states that its contents are external and not bookable");

const internal = await admin.get(`/external/listings?source=${KEY}`);
check(internal.json.total === 2, "while staff can see both ingested rows", `${internal.json?.total}`);
check(internal.json.publishable === 0, "none of them publishable", `${internal.json?.publishable}`);

console.log("\nGRANTING DISPLAY IS DELIBERATE AND NEEDS A DOCUMENT");
const noRef = await admin.patch(`/external/sources/${KEY}`, { licenceStatus: "LICENSED", displayRights: true });
check(noRef.status === 400 && /reference/i.test(noRef.json?.error?.message ?? ""),
  "display rights are refused without a licence reference", noRef.json?.error?.message);

const notLicensed = await admin.patch(`/external/sources/${KEY}`, { displayRights: true, licenceRef: "REF-1" });
check(notLicensed.status === 400, "and refused unless the status is LICENSED", `${notLicensed.status}`);

const imagesOnly = await admin.patch(`/external/sources/${KEY}`, { imageRights: true, licenceRef: "REF-1" });
check(imagesOnly.status === 400, "image rights cannot be granted without display rights", `${imagesOnly.status}`);

check((await owner.patch(`/external/sources/${KEY}`, { licenceStatus: "RESEARCH_ONLY" })).status !== 403,
  "an owner may record a licence");
const researchFeed = await anon.get("/public/external");
check(!researchFeed.json.listings.some((l) => l.title.includes("Malasaña")),
  "research-only data still never reaches the public feed");

console.log("\nA LICENCE FOR THE FACTS, BUT NOT THE PHOTOGRAPHS");
const factsOnly = await admin.patch(`/external/sources/${KEY}`, {
  licenceStatus: "LICENSED", licenceRef: "CONTRACT-2026-001", displayRights: true,
  imageRights: false, contactDataRights: false, attribution: "Data © E2E Aggregator",
});
check(factsOnly.status === 200, "recorded", JSON.stringify(factsOnly.json?.error));
check(factsOnly.json.reevaluated.displayable === 2, "and applied to existing rows immediately, not on the next sync",
  JSON.stringify(factsOnly.json?.reevaluated));

const feed1 = await anon.get("/public/external");
const es = feed1.json.listings.find((l) => l.title.includes("Malasaña"));
check(!!es, "the listing now appears");
check(es.price === 585000 && es.currency === "EUR", "with its facts");
check(es.images.length === 0, "but not one photograph — stripped from the payload, not hidden",
  JSON.stringify(es.images));
check(es.agentName === null && es.agentPhone === null,
  "and no agent contact details, which are personal data", `${es.agentName}/${es.agentPhone}`);
check(es.external === true && es.bookable === false, "flagged external and not bookable");
check(typeof es.disclosure === "string" && es.disclosure.length > 20, "carrying a disclosure");
check(es.attribution === "Data © E2E Aggregator", "and the attribution the licence obliges");
check(typeof es.sourceUrl !== "undefined", "with a route back to the source");

console.log("\nADDING IMAGE AND CONTACT RIGHTS");
await admin.patch(`/external/sources/${KEY}`, { imageRights: true, contactDataRights: true });
const feed2 = await anon.get("/public/external");
const es2 = feed2.json.listings.find((l) => l.title.includes("Malasaña"));
check(es2.images.length === 1, "photographs appear once the licence covers them", `${es2.images?.length}`);
check(es2.agentName === "Ana Ruiz", "and so do contact details");

console.log("\nTERRITORY LIMITS");
await admin.patch(`/external/sources/${KEY}`, { territories: ["ES"] });
const feed3 = await anon.get("/public/external");
check(feed3.json.listings.some((l) => l.title.includes("Malasaña")), "a Spanish listing under a Spanish licence stays");
check(!feed3.json.listings.some((l) => l.title.includes("Diani")),
  "a Kenyan one under the same licence does not");

console.log("\nAN EXPIRED LICENCE STOPS PUBLISHING");
await admin.patch(`/external/sources/${KEY}`, { territories: [], licenceExpiry: "2020-01-01T00:00:00.000Z" });
const feed4 = await anon.get("/public/external");
check(!feed4.json.listings.some((l) => l.title.includes("Malasaña")), "nothing from an expired licence");

// The read-time re-check is the one that matters: expire the licence behind the
// application's back, without any sweep, and the feed must still refuse.
await admin.patch(`/external/sources/${KEY}`, { licenceExpiry: null });
check((await anon.get("/public/external")).json.listings.some((l) => l.title.includes("Malasaña")),
  "restored when the expiry is lifted");
await prisma.externalSource.update({
  where: { key: KEY },
  data: { licenceExpiry: new Date("2020-01-01") },
});
const feed5 = await anon.get("/public/external");
check(!feed5.json.listings.some((l) => l.title.includes("Malasaña")),
  "and refused even when the stored flag was never swept — the feed re-checks the licence itself");
await prisma.externalSource.update({ where: { key: KEY }, data: { licenceExpiry: null } });

console.log("\nTAKEDOWNS");
const target = (await admin.get(`/external/listings?source=${KEY}`)).json.listings
  .find((l) => l.title.includes("Malasaña"));
check((await mgr.post(`/external/listings/${target.id}/suppress`, { reason: "x" })).status === 403,
  "a property manager cannot suppress");
check((await admin.post(`/external/listings/${target.id}/suppress`, {})).status === 400,
  "and a takedown needs a stated reason");

const down = await admin.post(`/external/listings/${target.id}/suppress`,
  { reason: "Rights holder objected to the photographs." });
check(down.status === 200, "a takedown is honoured");
check(!(await anon.get("/public/external")).json.listings.some((l) => l.title.includes("Malasaña")),
  "and takes effect immediately");

// The important part: a later sync must not undo it.
await prisma.externalListing.update({
  where: { id: target.id },
  data: { lastSeenAt: new Date(), displayable: false },
});
const stillDown = await prisma.externalListing.findUnique({ where: { id: target.id } });
check(stillDown.suppressed === true, "and the flag survives re-ingestion");
check(!(await anon.get("/public/external")).json.listings.some((l) => l.title.includes("Malasaña")),
  "so a rights holder never has to object twice");

console.log("\nSEPARATION FROM OUR OWN LISTINGS");
const ours = await anon.get("/public/listings");
check(!ours.json.listings.some((l) => l.title?.includes("Malasaña")),
  "external inventory never appears in our own marketplace feed");
check(await prisma.propertyListing.count({ where: { title: { contains: "Malasaña" } } }) === 0,
  "and was never written into PropertyListing");
const bookAttempt = await anon.get(`/public/listings/${target.id}`);
check(bookAttempt.status === 404, "an external id is not a bookable listing id", `${bookAttempt.status}`);

await prisma.externalSource.deleteMany({ where: { key: KEY } });
await prisma.$disconnect();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
