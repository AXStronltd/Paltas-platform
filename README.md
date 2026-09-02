# PALTAS

A property platform in two halves that share a database and one permission model.

- **Marketplace** — public. Listings, search, booking, escrow, and the landlord,
  agent, developer and hotel portals.
- **Management** — signed in, at `/manage`. Portfolio, Paltas Security
  Management, finance, payroll, rewards and marketplace publishing.

## Running it

```bash
npm install
cp .env.example .env          # set DATABASE_URL
npm run db:push               # create the schema
npm run db:seed               # two tenants, ten accounts, live data
npm run dev                   # http://localhost:3000
```

Postgres is the only hard requirement. The marketplace half runs on mock data and
needs nothing.

### Signing in

Everything below uses the password printed by the seed (`paltas-demo-2026` by
default). The point of the list is that the product genuinely differs for each.

| Account | Sees |
| --- | --- |
| `admin@paltas.com` | **Every organisation** — Paltas platform staff |
| `owner@paltas.co.ke` | Everything in Paltas Properties |
| `owner@coastalliving.co.ke` | A **second tenant** — Diani Palms only |
| `joseph.kamau@paltas.co.ke` | Kilimani Heights only |
| `hassan.omar@paltas.co.ke` | Nyali Court only |
| `mercy.njeri@paltas.co.ke` | Security for one property |
| `john.mutiso@paltas.co.ke` | A guard, with hand-picked permissions |
| `ruth.chebet@paltas.co.ke` | One **building** |
| `david.omondi@paltas.co.ke` | Finance across the organisation |
| `alice.nduta@paltas.co.ke` | Maintenance work orders |

Sign in as Joseph, then Hassan: neither appears in the other's responses, in any
endpoint, including the audit trail. Then as Amina and Salim, who cannot see each
other's *organisation* at all. Then as the platform admin, who sees all three
properties across both.

## What is here

| Area | Where |
| --- | --- |
| Authorisation engine | `src/lib/security/` — pure, no I/O |
| API | `src/app/api/` — 101 handlers, each authorising before it acts |
| Server-only | `src/server/` — database, sessions, Stripe secret, audit |
| Frontend | `src/components/`, `src/app/*/page.tsx` |
| Schema | `prisma/schema.prisma` |
| Tests | `tests/` — 304 checks |

`ARCHITECTURE.md` explains the layering and why it is one application rather than
a split frontend and backend.

## Screens

| Route | |
| --- | --- |
| `/` | Marketplace, with the destination carousel |
| `/manage` | Owner dashboard |
| `/manage/portfolio` | Portfolio → Property → Building → Unit → Resident |
| `/manage/security` | Gate console, visitors, cards, guards, incidents |
| `/manage/listings` | Draft and publish to the marketplace |
| `/manage/finance` | Fee schedule, charges, collection |
| `/manage/payroll` | Salaries, pay runs, payslips |
| `/manage/pricing` | Discounts and campaigns |
| `/manage/groups` | Group bookings and split payments |
| `/manage/rewards` | Paltas Rewards |
| `/manage/payouts` | Stripe Connect and settlements |
| `/manage/staff` | Staff and the per-person permission editor |
| `/manage/audit` | The audit trail |

## Verifying

```bash
npm run verify      # typecheck + pure tests + both structural audits
npm run test:all    # everything, 304 checks
```

```
engine (pure)     66      ✓ Every handler authorises before acting
permissions      100      ✓ Every mutating handler leaves a record
platform          17      ✓ The frontend/backend boundary holds
commerce          38
finance           50
publishing        33
```

The e2e suites reseed the database before each run, so they are repeatable rather
than order-dependent.

## Payments

Stripe keys are server-side only. `.env` is gitignored; `.env.example` carries
placeholders. The app refuses to start a payment if it finds a secret key in any
`NEXT_PUBLIC_` variable, because Next.js compiles those into the browser bundle.

Webhooks are signature-verified — HMAC-SHA256, timing-safe, five-minute replay
window. Stripe Connect is per-organisation, so switching an owner on to direct
payouts is a data change rather than a deploy.

## Security notes

- Owner and platform-admin authority are **database columns, not permissions**,
  so no role editing can mint or strip them.
- Nobody can grant authority they do not hold themselves at that scope.
- Sensitive permissions must be **named** by a role, never absorbed by a
  wildcard — enforced by a test, after a wildcard silently widened one role.
- Public endpoints are separate projections, not filtered private queries.
