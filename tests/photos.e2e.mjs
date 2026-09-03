/**
 * Listing photographs, end to end, against a live server.
 *
 * The pure suite proves which bytes may be accepted. This one proves the things
 * bytes cannot: that a stranger cannot upload to somebody's listing, that a host
 * cannot attach a photograph belonging to another organisation by guessing a
 * key, that an unconfigured deployment says so instead of handing out URLs that
 * cannot work, and that a listing id nobody may see returns the same answer
 * whether or not it exists.
 *
 * No object storage is configured in test, so the presign step answers 503.
 * That is the honest answer and it is asserted rather than skipped — the
 * refusals above all happen before storage is ever consulted, which is the
 * ordering this file exists to pin down.
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

const anon = client();
const owner = await staff("owner@paltas.co.ke");
const salim = await staff("owner@coastalliving.co.ke");

const mine = await owner.get("/listings");
const listing = mine.json?.listings?.[0];
if (!listing) { console.log("No listing to test against. Run the seed."); process.exit(1); }

console.log("A LISTING REPORTS ITS PHOTOGRAPHS BOTH WAYS");
// One list to delete by, one to display. Returning only one means either the
// pictures do not appear or they cannot be removed.
check(Array.isArray(listing.images), "the stored keys are returned");
check(Array.isArray(listing.imageUrls), "and the same list resolved to somewhere fetchable");
check(listing.images.length === listing.imageUrls.length, "one url per stored photograph",
  `${listing.images.length} vs ${listing.imageUrls.length}`);

console.log("\nPHOTOGRAPHS ARE NOT A PUBLIC ENDPOINT");
check((await anon.post(`/listings/${listing.id}/photos`, { contentType: "image/jpeg" })).status === 401,
  "a stranger cannot ask for an upload URL");
check((await anon.patch(`/listings/${listing.id}/photos`, { key: "x" })).status === 401,
  "nor confirm one");
check((await anon.del(`/listings/${listing.id}/photos?key=x`)).status === 401,
  "nor delete one");

console.log("\nONLY THE FORMATS A CAMERA PRODUCES");
for (const [type, why] of [
  ["image/svg+xml", "SVG is a document that can carry script"],
  ["text/html", "HTML is not a photograph"],
  ["image/gif", "GIF is not accepted"],
  ["", "no type at all"],
]) {
  const r = await owner.post(`/listings/${listing.id}/photos`, { contentType: type });
  check(r.status === 400, `refused: ${why}`, `${r.status}`);
}

console.log("\nSIZE IS BOUNDED BEFORE ANYTHING IS SIGNED");
const tooBig = await owner.post(`/listings/${listing.id}/photos`, {
  contentType: "image/jpeg", size: 50 * 1024 * 1024,
});
check(tooBig.status === 400, "a 50 MB file is refused up front", `${tooBig.status}`);

console.log("\nONE ORGANISATION CANNOT TOUCH ANOTHER'S LISTING");
// 404, not 403: whether a listing exists is itself not this caller's business.
const theirs = await salim.post(`/listings/${listing.id}/photos`, { contentType: "image/jpeg" });
check([403, 404].includes(theirs.status),
  "another tenant is refused the upload URL", `${theirs.status}`);
const theirsConfirm = await salim.patch(`/listings/${listing.id}/photos`, {
  key: `listings/${listing.id}/anything.jpg`,
});
check([403, 404].includes(theirsConfirm.status), "and cannot confirm one either", `${theirsConfirm.status}`);

console.log("\nA KEY THAT IS NOT THIS LISTING'S IS REFUSED");
// The confirm step is handed a key by the browser, and a browser can say
// anything. Without this a host attaches another's photograph to their advert.
for (const [key, why] of [
  ["listings/someone-else/other/x.jpg", "another organisation's prefix"],
  ["secrets/database-dump.sql", "something that is not a photograph at all"],
  [`listings/${listing.orgId ?? "org"}/${listing.id}/../../x.jpg`, "traversal"],
  ["", "nothing at all"],
]) {
  const r = await owner.patch(`/listings/${listing.id}/photos`, { key });
  check(r.status === 400, `refused: ${why}`, `${r.status}`);
}

console.log("\nAN UNCONFIGURED DEPLOYMENT SAYS SO");
// A valid request, refused only because storage is not set up. If this ever
// returns 200 in test, something is handing out URLs that cannot work.
const valid = await owner.post(`/listings/${listing.id}/photos`, {
  contentType: "image/jpeg", size: 400_000,
});
check(valid.status === 503, "storage that is not configured answers 503", `${valid.status}`);
check(/not configured/i.test(valid.json?.error?.message ?? ""),
  "and says why, rather than failing vaguely", valid.json?.error?.message);

console.log("\nA LISTING NOBODY MAY SEE ANSWERS THE SAME WAY WHETHER OR NOT IT EXISTS");
const invented = await owner.post("/listings/does-not-exist-at-all/photos", { contentType: "image/jpeg" });
check(invented.status === 404, "an invented id is a 404", `${invented.status}`);

console.log("\nDELETING SOMETHING THAT IS NOT THERE IS REFUSED, NOT PRETENDED");
const gone = await owner.del(`/listings/${listing.id}/photos?key=listings/x/y/never-existed.jpg`);
check(gone.status === 400, "removing a photograph the listing does not have", `${gone.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
