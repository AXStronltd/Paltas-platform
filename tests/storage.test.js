/**
 * Presigned upload URLs, under test.
 *
 * SigV4 is easy to get subtly wrong and the mistake only shows up against a
 * real bucket, as a 403 with no explanation. These do not prove a signature is
 * one AWS would accept — that needs a bucket — but they pin down everything a
 * bucket checks before it looks at the signature at all, and every property the
 * URL has to have to be safe to hand to a browser.
 *
 * Run with: npm run test:auth
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

// Set before the module is required: it reads the environment on each call, but
// being explicit here documents what a working configuration looks like.
process.env.S3_ENDPOINT = "https://account.r2.cloudflarestorage.com";
process.env.S3_REGION = "auto";
process.env.S3_BUCKET = "paltas-photos";
process.env.S3_ACCESS_KEY_ID = "AKIAEXAMPLE";
process.env.S3_SECRET_ACCESS_KEY = "secretexamplekeynotreal";

const {
  presignPut, publicUrl, photoUrl, storageEnabled,
} = require("../.test-build/server/storage.js");

const AT = new Date("2026-09-04T10:15:30Z");
const sign = (over = {}) =>
  presignPut({ key: "listings/org1/l1/abc.jpg", contentType: "image/jpeg", now: AT, ...over });

test("a signed URL carries everything a bucket checks first", () => {
  const { url } = sign();
  const u = new URL(url);
  const q = u.searchParams;
  assert.equal(q.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.match(q.get("X-Amz-Credential"), /^AKIAEXAMPLE\/20260904\/auto\/s3\/aws4_request$/);
  assert.equal(q.get("X-Amz-Date"), "20260904T101530Z");
  assert.equal(q.get("X-Amz-SignedHeaders"), "content-type;host");
  assert.match(q.get("X-Amz-Signature"), /^[0-9a-f]{64}$/, "a signature is 64 hex characters");
  assert.equal(u.pathname, "/paltas-photos/listings/org1/l1/abc.jpg");
});

test("the signature changes when anything signed changes", () => {
  // If any of these produced the same signature, that field is not actually
  // being signed and a browser could alter it freely.
  const base = new URL(sign().url).searchParams.get("X-Amz-Signature");
  const differs = [
    sign({ key: "listings/org1/l1/other.jpg" }),
    sign({ contentType: "image/png" }),
    sign({ now: new Date("2026-09-04T10:15:31Z") }),
    sign({ expiresInSeconds: 600 }),
  ];
  for (const d of differs) {
    assert.notEqual(new URL(d.url).searchParams.get("X-Amz-Signature"), base);
  }
});

test("the same request signed twice is identical", () => {
  // Nothing random may leak into a signature, or a retry becomes a 403.
  assert.equal(sign().url, sign().url);
});

test("a capability is narrow: one method, one key, minutes not days", () => {
  const short = new URL(sign({ expiresInSeconds: 1 }).url);
  const long = new URL(sign({ expiresInSeconds: 86_400 }).url);
  assert.equal(short.searchParams.get("X-Amz-Expires"), "30", "clamped up to a usable minimum");
  assert.equal(long.searchParams.get("X-Amz-Expires"), "3600", "and down to an hour");
  assert.equal(new URL(sign().url).searchParams.get("X-Amz-Expires"), "300", "five minutes by default");
});

test("the secret never appears in the URL", () => {
  // The signature is derived from it; the key itself must never travel.
  const { url } = sign();
  assert.ok(!url.includes(process.env.S3_SECRET_ACCESS_KEY), "the signing secret leaked into the URL");
  assert.ok(url.includes("AKIAEXAMPLE"), "the access key id is public and is expected");
});

test("a key with awkward characters is encoded, not mangled", () => {
  const { url } = sign({ key: "listings/org 1/l+1/a b.jpg" });
  assert.ok(!url.includes(" "), "a raw space would break the request");
  const u = new URL(url);
  assert.match(u.pathname, /%20/, "spaces are percent-encoded");
  assert.ok(u.pathname.startsWith("/paltas-photos/listings/"), "the path prefix survives encoding");
});

test("with no configuration it refuses rather than signing nonsense", () => {
  const endpoint = process.env.S3_ENDPOINT;
  delete process.env.S3_ENDPOINT;
  assert.equal(storageEnabled(), false);
  const r = presignPut({ key: "k", contentType: "image/jpeg", now: AT });
  assert.equal(r.url, null);
  assert.match(r.error, /not configured/i);
  process.env.S3_ENDPOINT = endpoint;
});

test("a stored key and a local path are told apart", () => {
  // A listing's images hold both kinds and always will: a sample photograph is
  // a path this application serves, a host's upload is a key in a bucket.
  assert.equal(photoUrl("/property/villa-pool.jpg"), "/property/villa-pool.jpg");
  assert.equal(photoUrl("https://cdn.example.com/x.jpg"), "https://cdn.example.com/x.jpg");
  assert.equal(photoUrl(""), "");
  assert.equal(photoUrl("listings/org1/l1/abc.jpg"), publicUrl("listings/org1/l1/abc.jpg"));
  assert.match(photoUrl("listings/org1/l1/abc.jpg"), /^https?:\/\//);
});
