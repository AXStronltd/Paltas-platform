/**
 * Messaging, and who may read it.
 *
 * The interesting property is not that a message can be sent. It is that a
 * thread belongs to exactly two parties and nobody else can reach it — and
 * that an id nobody owns and an id somebody else owns are answered
 * identically, so probing for conversations tells you nothing.
 */
import { PrismaClient } from "@prisma/client";

const BASE = `${process.env.PALTAS_URL ?? "http://localhost:3010"}/api`;
const P = process.env.SEED_PASSWORD || "paltas-demo-2026";
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

async function guest(email, name) {
  const reg = await anon.post("/guest/register", { email, name, password: "a-long-password-1" });
  if (reg.cookies) return client(reg.cookies);
  const login = await anon.post("/guest/login", { email, password: "a-long-password-1" });
  return client(login.cookies);
}

const stamp = Math.floor(Math.random() * 1e9);
const alice = await guest(`alice${stamp}@example.com`, "Alice Guest");
const mallory = await guest(`mallory${stamp}@example.com`, "Mallory Guest");

console.log("SIGNED OUT");
check((await anon.get("/messages")).status === 401, "the inbox refuses an anonymous caller");
check((await anon.post("/messages", { support: true })).status === 401, "and so does opening a thread");

console.log("\nA SUPPORT THREAD");
const opened = await alice.post("/messages", { support: true, body: "My payout has not arrived." });
check(opened.status === 201, "a guest can open one", `${opened.status}`);
const threadId = opened.json?.threadId;
check(!!threadId, "and is given its id");

const again = await alice.post("/messages", { support: true });
check(again.json?.threadId === threadId, "asking twice returns the same thread, not a second one");

const inbox = await alice.get("/messages");
check(inbox.status === 200, "it appears in her inbox");
const summary = inbox.json.threads.find((t) => t.id === threadId);
check(summary?.name === "PALTAS Support", "named as PALTAS Support", summary?.name);
check(summary?.official === true, "and marked official");

const thread = await alice.get(`/messages/${threadId}`);
check(thread.status === 200, "she can read it");
check(thread.json.thread.messages.some((m) => m.body.includes("payout") && m.mine), "her own message is hers");
check(thread.json.thread.messages.some((m) => !m.mine), "and the greeting is not");

console.log("\nA THREAD IS PRIVATE TO ITS PARTIES");
const stolen = await mallory.get(`/messages/${threadId}`);
check(stolen.status === 404, "another guest cannot read it", `${stolen.status}`);
const missing = await mallory.get("/messages/clnonexistent000000000000");
check(missing.status === stolen.status,
  "and an id that never existed is refused identically", `${missing.status} vs ${stolen.status}`);
check((await mallory.post(`/messages/${threadId}`, { body: "let me in" })).status === 404,
  "nor can they write into it");
check((await mallory.get("/messages")).json.threads.length === 0, "and their own inbox stays empty");

console.log("\nWHAT A MESSAGE MAY CONTAIN");
check((await alice.post(`/messages/${threadId}`, { body: "   " })).status === 400, "an empty message is refused");
check((await alice.post(`/messages/${threadId}`, { body: "x".repeat(4001) })).status === 400, "and an enormous one");
const sent = await alice.post(`/messages/${threadId}`, { body: "Any update?" });
check(sent.status === 201, "a real one is accepted");
check(sent.json.message.mine === true, "and comes back as hers");

console.log("\nUNREAD COUNTS ARE PER SIDE");
const fresh = await guest(`bob${stamp}@example.com`, "Bob Guest");
const bobThread = (await fresh.post("/messages", { support: true })).json.threadId;
const before = (await fresh.get("/messages")).json.threads.find((t) => t.id === bobThread);
check(before.unread === 1, "the greeting he has not read counts as unread", `${before?.unread}`);
await fresh.get(`/messages/${bobThread}`);
const after = (await fresh.get("/messages")).json.threads.find((t) => t.id === bobThread);
check(after.unread === 0, "and reading it clears the count", `${after?.unread}`);

console.log("\nHOSTS DO NOT COLD-MESSAGE");
const staffLogin = await anon.post("/auth/login", { email: "owner@paltas.co.ke", password: P });
const owner = client(staffLogin.cookies);
check((await owner.post("/messages", { support: true })).status === 403,
  "a staff account cannot open a conversation with a guest");
check((await owner.get("/messages")).status === 200, "but can read its own inbox");
check((await owner.get(`/messages/${threadId}`)).status === 404,
  "and cannot reach a support thread it is not part of");

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail === 0 ? 0 : 1);
