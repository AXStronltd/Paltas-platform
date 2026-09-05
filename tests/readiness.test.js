import test from "node:test";
import assert from "node:assert/strict";
import { readiness } from "../.test-build/lib/readiness.js";

const FULL = {
  DATABASE_URL: "postgres://zzsentinel-database",
  SUPABASE_URL: "https://zzsentinel-supabase.example",
  SUPABASE_ANON_KEY: "zzsentinel-anon",
  SUPABASE_SERVICE_ROLE_KEY: "zzsentinel-service",
  STRIPE_SECRET_KEY: "zzsentinel-sk",
  STRIPE_PUBLISHABLE_KEY: "zzsentinel-pk",
  STRIPE_WEBHOOK_SECRET: "zzsentinel-whsec",
  S3_ENDPOINT: "https://zzsentinel-s3.example",
  S3_BUCKET: "zzsentinel-bucket",
  S3_ACCESS_KEY_ID: "zzsentinel-keyid",
  S3_SECRET_ACCESS_KEY: "zzsentinel-secret",
  RESEND_API_KEY: "zzsentinel-resend",
  MAIL_FROM: "zzsentinel@paltas.io",
  GOOGLE_GEOCODING_API_KEY: "zzsentinel-geocode",
  GOOGLE_MAPS_BROWSER_KEY: "zzsentinel-browser",
};
const find = (env, key) => readiness(env).capabilities.find((c) => c.key === key);

test("a fully configured deployment is ready", () => {
  assert.equal(readiness(FULL).ready, true);
});

test("the report never contains a value from the environment", () => {
  // The whole point. A diagnostic that leaks what it diagnoses is worse than
  // having none, and this is the test that keeps it honest as fields are added.
  const json = JSON.stringify(readiness(FULL));
  for (const v of Object.values(FULL)) {
    assert.equal(json.includes(v), false, `readiness leaked "${v}"`);
  }
});

test("a missing webhook secret blocks launch", () => {
  const env = { ...FULL, STRIPE_WEBHOOK_SECRET: "" };
  assert.equal(readiness(env).ready, false);
  assert.equal(find(env, "payments.webhook").configured, false);
});

test("geocoding is reported but does not block launch", () => {
  const env = { ...FULL, GOOGLE_GEOCODING_API_KEY: "", GOOGLE_MAPS_API_KEY: "" };
  assert.equal(find(env, "geocoding").configured, false);
  assert.equal(readiness(env).ready, true, "a missing map should not hold up the announcement");
});

test("the NEXT_PUBLIC spelling alone does not satisfy server provisioning", () => {
  // The subtle one: sign-in keeps working while supabaseAdmin() returns null,
  // so Google sign-in cannot create the account behind it.
  const env = { ...FULL, SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" };
  assert.equal(find(env, "auth").configured, true, "browser sign-in is satisfied");
  assert.equal(find(env, "auth.admin").configured, false, "server provisioning is not");
});

test("whitespace is not configuration", () => {
  assert.equal(find({ ...FULL, STRIPE_WEBHOOK_SECRET: "   " }, "payments.webhook").configured, false);
});

test("every capability explains what a client would experience", () => {
  for (const c of readiness({}).capabilities) {
    assert.equal(c.consequence.length > 10, true, `${c.key} has no consequence`);
    assert.match(c.consequence, /\.$/);
  }
});

test("an empty environment is not ready and says so about everything", () => {
  const r = readiness({});
  assert.equal(r.ready, false);
  assert.equal(r.capabilities.every((c) => !c.configured), true);
});
