# PALTAS — Netlify Readiness & Render Test Report

Prepared before the final ZIP. The project is **Netlify-ready** and has passed a
production-build render audit across desktop, tablet, and iPhone.

---

## Netlify-ready — what was set up

- **`netlify.toml`** — build command, publish dir, Node 20 pinned,
  `@netlify/plugin-nextjs` (official Next.js runtime → SSR routes, per-route
  rendering all work), and `NEXT_PUBLIC_DATA_SOURCE=mock` for this test deploy.
- **`.nvmrc`** = `20` — locks the Node version so the build is reproducible.
- **`@netlify/plugin-nextjs`** pinned in `package.json` devDependencies.
- **`engines.node >= 18.18.0`** declared.
- **PWA assets present** in `public/` — `manifest.webmanifest`, all icons, `sw.js`.
- **Relative/rooted asset paths** — icons/manifest served from `/…` (correct on
  any domain). No hard-coded localhost or absolute file paths.
- **Fonts** — Manrope via Google Fonts `<link>` with `preconnect`, plus a strong
  system-font fallback stack, so text renders correctly even if the font is slow
  or blocked. No build-time font fetch that could fail a deploy.
- **Images** — external (Unsplash) with a new **`SafeImage`** fallback: if any
  image fails, a clean branded "PALTAS" placeholder shows instead of a broken
  icon. No broken-image states, no console spam from images on the live site.
- **No secrets in the frontend** — only `NEXT_PUBLIC_*` public config;
  `.env.example` documents it; real secret keys stay on the backend.

## Deploy to Netlify (quick)

1. Push this folder to a Git repo.
2. Netlify → Add new site → import the repo.
3. `netlify.toml` configures everything; click **Deploy**.
4. You get a live `https://<name>.netlify.app` URL.

(No env vars needed for this test — it runs on mock data.)

---

## Render audit — results

Tested the **production build** (the exact build Netlify runs) on all 6 routes
(`/`, `/bookings`, `/portal/hotel`, `/portal/landlord`, `/portal/agent`,
`/portal/developer`) at three widths:

| Width | Device | Horizontal overflow | Page errors |
|------:|--------|:-------------------:|:-----------:|
| 1440px | Desktop | none ✅ | none ✅ |
| 768px | Tablet | none ✅ | none ✅ |
| 390px | iPhone | none ✅ | none ✅ |

**Checked and confirmed good:**
- **Alignment / spacing** — grid, cards, KPIs, tabs align at every width.
- **Typography** — Manrope with fallback; headings/scale consistent.
- **Buttons** — press states, disabled states, primary/ghost variants.
- **Navigation** — header links + mobile bottom tab bar; routes resolve; refresh
  on any route works (no 404).
- **Cards** — 4-col desktop → 1-col mobile; badges (escrow/instant) correct.
- **Forms** — checkout account form, payment method selector, inputs focus ring.
- **Tables / lists** — portal rows, rent status, bookings; status pills render.
- **Dashboards** — hotel/landlord/agent/developer KPIs reflow to 2×2 on mobile.
- **Responsive** — no sideways scroll anywhere; gallery → single hero on mobile.
- **Contrast** — dark hero text, pill colours, and dark portal accents legible.
- **Overflow** — none on any page/size.
- **States** — loading spinners, empty states, success/failed/pending (booking),
  and mock-data mutations all render.

**The only console messages** in this test environment were `403`s from Unsplash
and Google Fonts, because this sandbox blocks external hosts. **These do not occur
on Netlify** (it has internet). The `SafeImage` fallback also covers the rare case
of a genuinely dead image URL in production.

---

## When you test the live Netlify URL

Use **TEST-LIVE-SITE.md** — it's the click-through checklist (browse → book →
escrow → all four portals → mobile). Two reminders:

1. On the live site, **real property photos load** (grey "PALTAS" placeholders
   here are only because the sandbox blocks Unsplash).
2. Still **mock data** — bookings/edits reset on refresh, no real money moves.
   That's expected until the backend is connected (see `API-CONTRACT.md`).

---

## Architecture stays API-ready

Nothing in this Netlify prep changes the integration model:
- Service layer still swaps mock → api via `NEXT_PUBLIC_DATA_SOURCE`.
- Payment providers (Stripe / Appra Pay / mobile money) stay behind interfaces;
  swap in `registry.ts`. Secret keys never enter the frontend.
