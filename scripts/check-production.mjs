/**
 * What is configured, and what is missing, on a running PALTAS deployment.
 *
 * Every gap in this session was an unset environment variable that failed
 * silently and looked like a bug: an empty Maps key that rendered a blank box,
 * absent storage that dead-ended onboarding. None of them announced
 * themselves. This asks the running site instead of guessing.
 *
 *   node scripts/check-production.mjs https://paltas.io
 *
 * It reads only what a browser already receives, and never prints a value —
 * a configuration report that leaks the configuration is worse than none.
 */
const base = (process.argv[2] ?? process.env.PALTAS_URL ?? "http://localhost:3010").replace(/\/+$/, "");
const set = (v) => (v ? "\x1b[32mSET\x1b[0m" : "\x1b[31mMISSING\x1b[0m");

const problems = [];

console.log(`\nPALTAS configuration — ${base}\n`);

const home = await fetch(base, { redirect: "follow" }).then((r) => r.text()).catch(() => "");
const match = home.match(/window\.__PALTAS_PUBLIC_CONFIG__=(\{.*?\})<\/script>/s);
const config = match ? JSON.parse(match[1]) : {};

if (!match) {
  console.log("  Could not read the public configuration block. Is the site up?\n");
  process.exit(1);
}

console.log("BROWSER CONFIGURATION");
for (const [key, label, why] of [
  ["supabaseUrl", "Supabase URL", "sign-in cannot work"],
  ["supabaseAnonKey", "Supabase key", "sign-in cannot work"],
  ["googleMapsKey", "Google Maps key", "no map, no location autocomplete"],
]) {
  const ok = Boolean(config[key]);
  console.log(`  ${label.padEnd(18)} ${set(ok)}`);
  if (!ok) problems.push(`${label} is missing — ${why}.`);
}

console.log("\nSERVER FEATURES");
for (const [path, label, why] of [
  ["/api/public/listings", "Listings API", "the catalogue cannot load"],
  ["/api/messages", "Messages API", "the inbox cannot load"],
]) {
  const status = await fetch(base + path).then((r) => r.status).catch(() => 0);
  // 401 is a healthy answer from an endpoint that requires a session.
  const ok = status === 200 || status === 401;
  console.log(`  ${label.padEnd(18)} ${ok ? "\x1b[32mOK\x1b[0m" : `\x1b[31m${status || "unreachable"}\x1b[0m`}`);
  if (!ok) problems.push(`${label} answered ${status || "nothing"} — ${why}.`);
}

// Storage is not observable from outside without a session, so it is inferred
// from the endpoint that refuses when it is unconfigured.
const storage = await fetch(base + "/api/verification/documents", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "IDENTITY", fileName: "probe.pdf", contentType: "application/pdf", size: 1 }),
}).then((r) => r.status).catch(() => 0);
console.log(`  ${"Document storage".padEnd(18)} ${storage === 503 ? "\x1b[31mNOT CONFIGURED\x1b[0m" : storage === 401 ? "\x1b[33mneeds a session to confirm\x1b[0m" : "\x1b[32mreachable\x1b[0m"}`);
if (storage === 503) problems.push("Object storage is unconfigured — ID documents cannot be uploaded, so no account requiring one can be approved.");

console.log(problems.length ? `\n${problems.length} PROBLEM${problems.length === 1 ? "" : "S"}` : "\nNo problems found.");
for (const problem of problems) console.log(`  • ${problem}`);
console.log();
process.exit(problems.length ? 1 : 0);
