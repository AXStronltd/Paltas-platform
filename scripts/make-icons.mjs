/**
 * Build every icon the platform needs from one logo file.
 *
 * A PWA needs more icons than anyone remembers: the manifest wants 192 and 512,
 * Android wants a *maskable* variant with its subject inside a safe circle,
 * iOS wants a 180 with no transparency because it composites onto white and a
 * transparent logo turns into a white square, and the browser tab wants a 32
 * and a 16 that still read at the size of a full stop.
 *
 * Doing that by hand is how a set of icons drifts out of step with the logo.
 * This regenerates all of them from a single source, so replacing the logo is
 * one command rather than an afternoon.
 *
 *   node scripts/make-icons.mjs [path-to-logo.png]
 *
 * The source should be square-ish and at least 512px on its longest side —
 * ideally 1024. It warns rather than refusing if it is smaller, because an
 * upscaled icon that exists beats a crisp one that does not, but a soft icon is
 * the first thing anyone notices about an installed app.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SOURCE = process.argv[2] ?? "public/paltas-logo.png";
const OUT = "public/icons";

/** The brand teal, matching `theme_color` in the manifest. */
const BRAND = "#00C4AC";

/**
 * Android masks a maskable icon to whatever shape the launcher likes — circle,
 * squircle, teardrop. Anything outside the middle 80% can be cut off, so the
 * logo is drawn at 62% and centred, which survives every mask in use.
 */
const MASKABLE_SUBJECT = 0.62;

/** iOS never masks, so the logo can be larger, but it must not be transparent. */
const APPLE_SUBJECT = 0.78;

if (!existsSync(SOURCE)) {
  console.error(`No logo at ${SOURCE}. Pass one: node scripts/make-icons.mjs path/to/logo.png`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const py = (code) => execFileSync("python3", ["-c", code], { encoding: "utf8" }).trim();

const size = py(`
from PIL import Image
im = Image.open(${JSON.stringify(SOURCE)})
print(f"{im.size[0]}x{im.size[1]}")
`);
const [w, h] = size.split("x").map(Number);
console.log(`Source: ${SOURCE} (${w}×${h})`);
if (Math.max(w, h) < 512) {
  console.warn(
    `\n  ! ${Math.max(w, h)}px is small for a 512px icon. It will be upscaled and will\n` +
    `    look soft on an installed app. Re-run with a 1024px PNG or an SVG export\n` +
    `    when you have one — the icons regenerate in one command.\n`,
  );
}

/**
 * One icon.
 *
 * `subject` is how much of the canvas the logo occupies; the rest is padding.
 * `background` null keeps transparency, which is right for the tab favicon and
 * wrong for anything iOS or Android will composite itself.
 */
function render({ out, canvas, subject, background }) {
  py(`
from PIL import Image

src = Image.open(${JSON.stringify(SOURCE)}).convert("RGBA")
canvas = ${canvas}
subject = ${subject}

# Fit the logo inside the subject box without distorting it: a squashed logo is
# worse than a small one.
box = int(canvas * subject)
ratio = min(box / src.width, box / src.height)
w, h = max(1, round(src.width * ratio)), max(1, round(src.height * ratio))
logo = src.resize((w, h), Image.LANCZOS)

bg = ${background ? `"${background}"` : "None"}
if bg:
    # Flattened onto a solid colour. iOS turns transparency into white and
    # Android's mask turns it into a hole, so neither may keep an alpha channel.
    out = Image.new("RGBA", (canvas, canvas), bg)
else:
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))

out.alpha_composite(logo, ((canvas - w) // 2, (canvas - h) // 2))
if bg:
    out = out.convert("RGB")
out.save(${JSON.stringify("PLACEHOLDER")}.replace("PLACEHOLDER", ${JSON.stringify(out)}))
`);
  console.log(`  ✓ ${out}`);
}

console.log("\nWriting icons:");

// Manifest icons. `any` keeps the logo on its own ground; the maskable one is
// flattened because a launcher will cut a shape out of it.
render({ out: join(OUT, "icon-192.png"), canvas: 192, subject: APPLE_SUBJECT, background: BRAND });
render({ out: join(OUT, "icon-512.png"), canvas: 512, subject: APPLE_SUBJECT, background: BRAND });
render({ out: join(OUT, "icon-maskable-512.png"), canvas: 512, subject: MASKABLE_SUBJECT, background: BRAND });

// iOS home screen. No alpha, or it composites to a white tile.
render({ out: join(OUT, "apple-touch-icon.png"), canvas: 180, subject: APPLE_SUBJECT, background: BRAND });

// Browser tab. Transparent, so it sits on whatever the tab strip is.
render({ out: join(OUT, "favicon-32.png"), canvas: 32, subject: 0.92, background: null });
render({ out: join(OUT, "favicon-16.png"), canvas: 16, subject: 0.92, background: null });

/*
 * A real .ico, containing 16 and 32. Browsers have honoured PNG favicons for
 * years, but /favicon.ico is still requested by default and by a long tail of
 * feed readers, link unfurlers and corporate proxies. Serving a 404 there is a
 * small, permanent scruff on every request log.
 */
py(`
from PIL import Image
im = Image.open(${JSON.stringify(SOURCE)}).convert("RGBA")
im.save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
`);
console.log("  ✓ public/favicon.ico");

console.log("\nDone. Replace the logo and re-run to regenerate all of them.");
