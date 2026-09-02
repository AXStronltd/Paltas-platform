# PALTAS — architecture

One Next.js application containing two products that share a database and a
permission model:

- **The marketplace** — public. Listings, search, booking, escrow, the four role
  portals. Runs on a mock/Supabase service layer, unchanged from before.
- **The management platform** — signed in, at `/manage`. Portfolio, security,
  finance, payroll, rewards, publishing. Backed by Postgres.

## Why not separate frontend and backend repositories

A reasonable question, and the answer is that Next.js App Router *is* the split —
`src/app/api` runs only on the server, `src/components` runs in the browser, and
the framework enforces the divide at build time. Pulling them into separate
packages would mean a second HTTP hop, a second deployment, duplicated types, and
a shared-types package to keep them honest. That is a real architecture, but it
buys nothing here and costs a great deal.

What matters is not which directory the code sits in but **whether the boundary
holds**. So it is enforced rather than assumed:

```
npm run audit:layers
```

```
175 source files · 47 client components · 11 server modules
✓ No client component imports server-only code.
✓ No server module depends on a component.
✓ Shared code in src/lib stays isomorphic.
```

Nothing in Next.js stops a `"use client"` component importing the Prisma client
or the Stripe module. It would compile — and ship the database driver, and
anything in the same module as a secret, to the browser. That check is what
stops it.

## The layers

```
                    ┌─────────────────────────────────────────┐
  browser           │  src/components/     47 client parts    │
                    │  src/app/*/page.tsx  21 pages           │
                    └──────────────────┬──────────────────────┘
                                       │  fetch, cookie session
                    ┌──────────────────▼──────────────────────┐
  HTTP boundary     │  src/app/api/        101 handlers       │
                    │  every one authorises before it acts    │
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────┐
  server only       │  src/server/         11 modules         │
                    │  db · session · scope · audit · stripe  │
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────┐
  data              │  prisma/schema.prisma   40+ models      │
                    └─────────────────────────────────────────┘

  src/lib/  — isomorphic. Pure logic and types, safe on both sides:
              security/ (the authorisation engine), pricing/, loyalty/,
              models/, services/ (typed API clients), providers/
```

### `src/server` — backend only

| Module | Holds |
| --- | --- |
| `db.ts` | The Prisma client singleton |
| `session.ts` | httpOnly cookie sessions; only the SHA-256 is stored |
| `actor.ts` | Loads a user with their roles and grants |
| `scope.ts` | Turns a scope filter into a database query |
| `http.ts` | `guard()` / `guardList()` — the gate every route passes |
| `audit.ts` | Who did what, where, when, before and after |
| `stripe.ts` | The secret key. Never logged, never returned |
| `password.ts` | scrypt, from the standard library |
| `presenters.ts` | Wire shapes shared between routes |
| `staffScopes.ts` | The no-privilege-escalation rule |
| `passes.ts` | QR tokens and reference generation |

Route modules may only export HTTP handlers, which is why shared helpers live
here rather than being exported from a route — a Next.js build error that turns
out to be a useful constraint.

### `src/lib/security` — the authorisation engine

Pure. No database, no request object, no I/O. Decides everything the product
allows or refuses, and can be read in one sitting and tested without a server.

The rules, in order:

1. A suspended or merely-invited account decides nothing.
2. A **Paltas platform administrator** may do anything, in any organisation.
3. The **owner** may do anything inside their own organisation.
4. An explicit **DENY** anywhere on the scope chain wins.
5. Otherwise an **ALLOW** anywhere on the chain grants it.
6. Otherwise refused. Nothing is permitted by omission.

Scope inherits **downward only** along `Organization → Property → Building →
Unit`. Both (2) and (3) are database columns rather than permissions, so no
amount of role editing by a tenant can mint or strip them.

## Requests, end to end

```
  browser                    API handler                  engine / database
  ───────                    ───────────                  ─────────────────
  POST /api/security/
       cards/x/suspend  ──▶  guard(CARD_SUSPEND, {unitId})
                               ├─ currentActor()      ──▶  session → user
                               ├─ resolveScope()      ──▶  unit → building
                               │                           → property → org
                               ├─ decide(actor, …)    ──▶  pure, no I/O
                               │     refused? ────────▶  403 + audit denial
                               └─ allowed
                             suspend the card         ──▶  UPDATE
                             writeAudit(before/after) ──▶  INSERT
                        ◀──  200
```

The browser's copy of the permission list (`/api/me`) decides only what to
*render*. Every action it reveals is authorised again on the server, so a client
that ignored it entirely would gain nothing.

## Public projections

Two endpoints are unauthenticated on purpose, and both are **separate queries
rather than filtered views** of the private ones:

- `/api/public/listings` — PUBLISHED listings only
- `/api/public/offers` — LIVE campaigns only

Built as their own projections so a new private field cannot leak by default.
Neither returns a tenant identifier, an internal id, a draft, or a redemption
count.

## Payments

The secret key lives in `src/server/stripe.ts` and nowhere else. The browser gets
the publishable key and Stripe's own iframe, so card details never touch this
origin.

The flow is server-first: the browser says *what* is being paid, the server works
out *how much* and returns only a client secret. **The browser never names a
price.** The webhook is the authority — the ledger moves when Stripe tells the
server it moved, not on the strength of a confirmation screen.

## Internationalisation

`src/lib/i18n/` — pure, so locale negotiation is tested without a browser.

**Language and market are separate choices.** Conflating them is the commonest
failure in "global" platforms: switch to Swedish and your search of Vilnius flats
vanishes. Here a Lithuanian in Stockholm reads Lithuanian text about Swedish
properties, and either can be changed alone.

| | Answers |
| --- | --- |
| **Locale** (`en`, `sv`, `lt`) | What language you read |
| **Market** (`KE`, `SE`, `LT`) | Whose properties, currency, rules and conventions |

Resolution order, in `resolvePreferences()`: an explicit choice, then the
browser's `Accept-Language` and the CDN's country header, then defaults. **A
choice always outranks a signal** — someone who clicked "English" means it,
however their browser is configured.

`src/middleware.ts` decides once at the edge and passes the answer down as
headers, so the server's first render is already correct rather than flashing
English and swapping after hydration. It imports only pure locale logic, because
middleware runs on the Edge runtime where `src/server` does not exist.

### Markets are data

Adding Norway is an entry in `MARKETS` plus a catalogue — not a search through
components for `if (country === …)`. Each market carries its currency, default
language, popular cities, local payment methods, the tax label (VAT / Moms /
PVM), and the tenancy rule a renter there asks about first.

### Two things deliberately not done

- **Currency is formatted, never converted.** Prices are held in each market's
  own currency. Showing a Kenyan price with a Swedish symbol because someone
  changed language would be worse than showing nothing.
- **The Swedish and Lithuanian catalogues are machine-authored and say so** in
  their `$meta.reviewedBy`. A test asserts they are marked unreviewed. They need
  a native speaker before commercial use — particularly the tenancy and fee
  wording, where a mistranslation is a legal exposure rather than a rough edge.

Pluralisation uses `Intl.PluralRules`, so Lithuanian's one/few/other is selected
by the rules the language actually uses rather than anything hand-rolled.

## Verification

```
npm run verify        typecheck + engine tests + both structural audits
npm run test:all      everything, 318 checks across six suites
```

| Suite | Checks | Needs a database |
| --- | --- | --- |
| `test:auth` | 80 | no — pure engine, pricing, loyalty, Stripe signatures |
| `test:e2e` | 100 | yes — permissions over real HTTP |
| `test:platform` | 17 | yes — cross-organisation isolation |
| `test:commerce` | 38 | yes — pricing, groups, shopfront |
| `test:finance` | 50 | yes — fee schedule, payroll, rewards |
| `test:publishing` | 33 | yes — listings, Stripe, Connect |

Two structural invariants are machine-checked rather than trusted:

```
npm run audit:routes    ✓ Every handler authorises before acting
                        ✓ Every mutating handler leaves a record
npm run audit:layers    ✓ The frontend/backend boundary holds
```

Both exist because they are the kind of claim that is true on the day it is
written and quietly false six months later.
