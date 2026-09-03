/**
 * How much of the platform actually speaks the visitor's language?
 *
 * Two questions, both easy to be wrong about:
 *
 *   1. Does every catalogue cover every key English defines? A missing key
 *      falls back to English rather than breaking, which is the right
 *      behaviour and also the reason nobody notices for months.
 *
 *   2. How many components render user-visible text without going through
 *      `t()`? This is the honest measure of "the whole platform translates",
 *      and it is deliberately reported rather than enforced — the portals and
 *      the management console are still English, and a number that says so is
 *      worth more than a claim that they are not.
 *
 * Run with: npm run audit:i18n
 */

import fs from "node:fs";
import path from "node:path";

const MSG = "src/lib/i18n/messages";
const en = JSON.parse(fs.readFileSync(`${MSG}/en.json`, "utf8"));
const keys = Object.keys(en).filter((k) => !k.startsWith("$"));

console.log(`English defines ${keys.length} messages.\n`);

let problems = 0;
const rows = [];

for (const file of fs.readdirSync(MSG).sort()) {
  if (!file.endsWith(".json") || file === "en.json") continue;
  const code = file.replace(".json", "");
  const cat = JSON.parse(fs.readFileSync(`${MSG}/${file}`, "utf8"));

  /*
   * Some messages are deliberately English everywhere: the privacy policy, the
   * terms and the cookie notice. A machine translation of a legal document into
   * fifteen languages nobody has reviewed is a liability rather than a feature,
   * and naming one authoritative language is what platforms actually do. They
   * are declared in `$meta.englishOnly` so this number reports a decision
   * rather than a gap.
   */
  const englishOnly = new Set(cat.$meta?.englishOnly ?? []);
  const translatable = keys.filter((k) => !englishOnly.has(k));
  const missing = translatable.filter((k) => !(k in cat));
  // A value identical to English is usually untranslated rather than a word
  // that happens to be the same, so it is counted separately rather than as
  // coverage. Some genuinely are the same word — "Hotel" in Spanish, "Menu" in
  // French, and the bare `{taxLabel}` placeholder — and a catalogue declares
  // those in `$meta.sameAsEnglish` so they count as translated rather than
  // pushing someone to invent a worse word to satisfy this number.
  const declared = new Set(cat.$meta?.sameAsEnglish ?? []);
  const same = translatable.filter((k) => k in cat && cat[k] === en[k] && !declared.has(k));
  const translated = translatable.length - missing.length - same.length;
  const pct = Math.round((translated / translatable.length) * 100);
  const reviewed = cat.$meta?.reviewedBy ?? "unknown";

  rows.push({ code, pct, translated, missing: missing.length, same: same.length, reviewed });

  // Extra keys mean a catalogue has drifted from English and carries messages
  // nothing renders.
  const extra = Object.keys(cat).filter((k) => !k.startsWith("$") && !(k in en));
  if (englishOnly.size && rows.length === 0) {
    console.log(`  ${englishOnly.size} message(s) are deliberately English everywhere (legal copy).\n`);
  }
  if (extra.length) {
    console.log(`  ${code}: ${extra.length} key(s) not in English — ${extra.slice(0, 4).join(", ")}`);
    problems++;
  }
}

const w = 6;
console.log("lang".padEnd(w) + "coverage".padEnd(12) + "same as en".padEnd(13) + "reviewed by");
console.log("─".repeat(52));
for (const r of rows.sort((a, b) => b.pct - a.pct)) {
  console.log(
    r.code.padEnd(w) +
    `${r.pct}%`.padEnd(12) +
    String(r.same + r.missing).padEnd(13) +
    r.reviewed,
  );
}

/* ------------------------- component coverage ------------------------- */

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const components = [...walk("src/components"), ...walk("src/app")];
const translating = components.filter((f) => /\buseI18n\b/.test(fs.readFileSync(f, "utf8")));

// Where the untranslated text actually is, so the next pass has a work list.
const AREAS = [
  ["marketplace (what a guest sees)", (f) => /marketplace|booking|ui\/|app\//.test(f)],
  ["portals (landlord, hotel, agent, developer)", (f) => f.includes("/portal/")],
  ["management console", (f) => /\/manage\/|\/security\/|\/staff\/|\/finance\/|\/publishing\/|\/payments\//.test(f)],
];

console.log(`\n${translating.length} of ${components.length} components call t().`);
for (const [label, match] of AREAS) {
  const inArea = components.filter(match);
  const done = inArea.filter((f) => translating.includes(f));
  console.log(`  ${label}: ${done.length}/${inArea.length}`);
}

console.log(
  problems === 0
    ? "\n✓ No catalogue carries keys English does not define."
    : `\n${problems} catalogue(s) have drifted from English.`,
);
process.exit(problems === 0 ? 0 : 1);
