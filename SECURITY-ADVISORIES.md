# Dependency advisories

Last reviewed: 2 September 2026, on `next@14.2.35`.

## Fixed

| | Was | Now |
| --- | --- | --- |
| **Next.js** — critical | 14.2.5 | **14.2.35** |
| **postcss** — high | 8.4.31 (bundled by Next) | **8.5.26** via an `overrides` entry |

The Next upgrade closes, among others:

- **Authorization Bypass in Middleware** (GHSA-f82v-jwr5-mffw) — the critical one.
  This application does not authorise in middleware, so the bypass granted no
  access here: `src/middleware.ts` only resolves language and market, and every
  permission decision happens inside a route handler behind `guard()`. It is
  still patched, because relying on "our architecture happens to avoid it" is
  not a security posture.
- Cache poisoning in RSC responses and Image Optimization
- SSRF via middleware redirect handling
- Information exposure in the dev server

`postcss` ships inside Next, so it is pinned with an `overrides` entry rather
than waiting for a Next release that bumps it.

## Remaining, and why

One high-severity advisory group is still open against `next@14.2.x`. Clearing
it entirely requires **Next 16**, which is a major upgrade and should be
deliberate work with its own testing, not a security patch smuggled in sideways.

Assessed against what this application actually does:

| Advisory | Applies here? |
| --- | --- |
| Middleware/Proxy bypass with i18n | **No** — that is Pages Router; this is App Router |
| DoS via Server Actions | **No** — no Server Actions are used |
| XSS via CSP nonces | **No** — no nonces are used |
| SSRF via WebSocket upgrades | **No** — no WebSocket upgrades |
| HTTP smuggling in rewrites | **No** — no rewrites configured |
| SSRF via rewrite destination hostname | **No** — as above |
| **DoS via Image Optimizer `remotePatterns`** | **Yes** — `next.config.mjs` allows `images.unsplash.com` |

So one applies. It is a denial-of-service against the image optimizer, not a
data-exposure or authorisation issue.

### Mitigating the one that applies

The optimizer is only reachable because listing images may be remote. Options,
in increasing order of effort:

1. **Serve images from your own origin** and drop `remotePatterns` entirely.
   Listings created through `/manage/listings` already take image paths, so this
   is the natural end state once real photographs are uploaded rather than
   linked.
2. **Put the image route behind your CDN's rate limiting.**
3. **Upgrade to Next 16**, which closes it along with the rest.

## Checking this yourself

```bash
npm audit
```

CI does not currently fail on advisories, deliberately: a new advisory against a
transitive dependency would then block an unrelated deploy. Review it on a
schedule instead, and treat anything **critical** or anything in the table above
that changes to "applies here" as work rather than noise.
