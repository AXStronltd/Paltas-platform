# Paltas Security Management

This document covers the module added to the existing PALTAS app: the permission
model, Paltas Security Management, the owner dashboard, and the audit trail.

The marketplace side of PALTAS — listings, bookings, escrow, the four role
portals — is untouched and still runs on its mock/Supabase service layer. What is
new lives under `/manage` and `/api`, and is backed by Postgres.

---

## Getting it running

```bash
npm install
cp .env.example .env            # set DATABASE_URL
npm run db:push                 # create the schema (or db:migrate for a migration history)
npm run db:seed                 # two properties, nine accounts, live security data
npm run dev                     # http://localhost:3000/manage
```

Postgres 16 is installed locally via Homebrew and a `paltas` database is created
and seeded. It was started with `pg_ctl` rather than `brew services`, so nothing
was registered to launch at login — after a reboot, start it again with:

```bash
/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 -l /tmp/pg.log start
```

Or `brew services start postgresql@16` if you would rather it came up on its own.

The seed prints every account and its password. Sign in as each in turn — the
product looks genuinely different for each one, which is the point.

| Account | Role | Reach |
| --- | --- | --- |
| `admin@paltas.com` | **Paltas Platform Admin** | **Every organisation on the platform** |
| `owner@paltas.co.ke` | Property Owner | Everything in Paltas Properties |
| `joseph.kamau@paltas.co.ke` | Property Manager | Kilimani Heights only |
| `mercy.njeri@paltas.co.ke` | Security Manager | Kilimani Heights only |
| `john.mutiso@paltas.co.ke` | Security Guard | Kilimani, with custom permissions |
| `peter.wafula@paltas.co.ke` | Security Guard | Kilimani, role defaults |
| `alice.nduta@paltas.co.ke` | Maintenance | Kilimani only |
| `david.omondi@paltas.co.ke` | Accountant | Whole organisation, finance only |
| `ruth.chebet@paltas.co.ke` | Block B Supervisor | One building |
| `hassan.omar@paltas.co.ke` | Property Manager | Nyali Court only |
| `owner@coastalliving.co.ke` | Property Owner | **A second tenant** — Diani Palms only |

Sign in as Joseph, then as Hassan. Neither can see the other's property in any
response — not the portfolio, not the visitor list, not the audit trail.

Then sign in as Amina and as Salim: two owners, each absolute inside their own
organisation and unable to see a single row of the other's. Then as
`admin@paltas.com`, who sees all three properties across both.

---

## The permission model

### Three levels of authority

| | Scope | Stored as | Can be granted by |
| --- | --- | --- | --- |
| **Paltas platform admin** | Every organisation | `User.isPlatformAdmin` column | Nobody, through the API |
| **Property owner** | One organisation, absolutely | `User.isOwner` column | Nobody, through the API |
| **Staff** | Whatever their grants name | Role assignments + permission grants | Anyone holding it themselves |

Both of the first two are columns rather than permissions, and deliberately so:
no amount of role or permission editing by a tenant can manufacture either, and
neither can be stripped by the permission editor. A tenant who grants themselves
`*` across their own organisation is still confined to it.

### Where decisions are made

One pure function, in `src/lib/security/authorize.ts`:

```ts
decide(actor, permission, scopeChain) -> { allowed, reason, matched }
```

It touches no database and no request object. Everything else — route handlers,
list filters, the UI — is a caller of it. The rules, in order:

1. A suspended or merely-invited account decides nothing.
2. A **Paltas platform administrator** may do anything, in any organisation.
3. The **owner** may do anything inside their own organisation.
4. An explicit **DENY** anywhere on the scope chain wins.
5. Otherwise an **ALLOW** anywhere on the chain grants it.
6. Otherwise refused. Nothing is permitted by omission.

### Scope

Every grant is pinned to one node of `Organization → Property → Building → Unit`
and inherits **downward only**. A grant at property level covers every building
and unit beneath it; a grant at unit level confers nothing upward.

This is what makes data isolation a property of the model rather than a rule the
UI is trusted to remember. `scopeFilterFor()` turns an actor's grants into the
set of scopes a list query may read, and the query is narrowed *before* it runs
rather than the results being filtered after.

### Roles and custom permissions

Roles (`src/lib/security/system-roles.json`) are starting points. Alongside them,
each user can carry individual grants with an `ALLOW` or `DENY` effect at a
specific scope — which is what makes the system not merely role-driven.

The brief's worked example is seeded and tested:

```
John Mutiso — Security Guard @ Kilimani Heights
  ✅ resident.view              (granted individually, on top of the role)
  ✅ visitor.approve            (granted individually)
  ✅ visitor.checkin / checkout / pass.verify   (from the role)
  ✅ security.incident.view / create            (from the role)
  ❌ finance.view               (denied individually)
  ❌ staff.create               (denied individually)
  ❌ property.delete            (denied individually)
  ❌ owner.info.view            (denied individually)
```

A deny that merely repeats what the role already withholds is not redundant: it
survives the role being widened later. The editor keeps it as a distinct state
from "inherit" for that reason.

### Escalation is refused

Nobody can grant authority they do not hold themselves at that scope
(`src/server/staffScopes.ts`). Without this, `staff.create` alone would be a path
to full access: create an account, give it everything, sign in as it. Role
assignments are expanded to their permissions and held to the same standard.

Also enforced: the owner's account cannot be renamed, suspended, deleted or
re-permissioned by any staff member, and nobody can edit their own permissions.

---

## Backend authorisation

Every route handler names the permission it needs and the part of the portfolio
it touches, and cannot reach its own body until that has been checked:

```ts
const g = await guard(PERMISSIONS.CARD_SUSPEND, { unitId: card.unitId });
if (!g.ok) return g.response;
```

`guard()` authenticates, resolves the scope's ancestors from the database,
decides, writes a denial to the audit trail on refusal, and returns a 403 with
the engine's reason. For collection endpoints, `guardList()` returns the filter
the query must be narrowed by instead of a yes/no.

Verify this holds at any time:

```bash
npm run audit:routes
```

```
42 route files · 64 HTTP handlers
✓ Every handler authorises before acting.
✓ Every mutating handler leaves a record.
```

Frontend visibility is derived from the same model, via `/api/me` — but it is
only ever cosmetic. A client that ignored it entirely would gain nothing.

### Permission keys

Defined once in `src/lib/security/permissions.ts`, grouped for the editor:
portfolio, residents, visitors, access control, security operations, maintenance,
finance, staff, oversight. Grants may use wildcards (`visitor.*`); the dot is
required so prefixes cannot bleed (`visitor.*` never matches `visitors.checkin`).

---

## Security Management

| Area | Endpoints |
| --- | --- |
| Visitors | `/api/security/visitors`, `/api/security/invitations` (+ `approve`, `cancel`, `qr`) |
| QR passes | `/api/security/passes/verify` |
| Check-in / out | `/api/security/visits`, `/visits/checkin`, `/visits/[id]/checkout` |
| Access cards | `/api/security/cards` (+ `suspend`, `reinstate`, `verify`) |
| Vehicles | `/api/security/vehicles` |
| Gates | `/api/security/gates` |
| Guards & shifts | `/api/security/guards`, `/api/security/shifts` |
| Incidents | `/api/security/incidents` (+ `[id]`) |
| Emergencies | `/api/security/emergency` (+ `acknowledge`) |
| Access history | `/api/security/access-events` |
| Dashboard & reports | `/api/security/dashboard`, `/api/security/reports` |

Visitor types cover family and friends, deliveries, contractors, domestic workers
and drivers. Passes carry a QR token and a short human-readable code, because a
cracked phone screen at a gate should not become a reason to wave someone
through. Recurring passes count down their uses and expire on their own.

Two details worth knowing:

- **Check-in against a pass consumes a use inside the same transaction** as the
  visit is created, guarded by the use count in the `WHERE` clause. Two guards
  scanning the same single-use pass at two gates cannot both admit.
- **Refusals are recorded as carefully as admissions.** A denied scan writes an
  `AccessEvent` before the guard sees the answer. A run of refused scans at one
  gate on one evening is the pattern the access history exists to surface.

---

## Audit trail

`AuditLog` records who, what, which property/building/unit, when, and the value
before and after where one changed. Refused attempts are logged too.

The summary line is written by the code that performed the action, which is why
it can say what it says:

> **John Mutiso** — Security Guard
> Suspended access card A204-02 · Block A A-204 — Card reported lost by resident
> 02 Sep 2026, 18:42

`changes()` in `src/server/audit.ts` stores only the fields that actually moved,
with a redaction list so password hashes and QR tokens stay out of the log.

Gate scans go to `AccessEvent` rather than `AuditLog` — same discipline, purpose-
built table, surfaced in the Access history tab.

---

## Pricing, campaigns and group bookings

### Discounts

Six kinds — group, seasonal, early-bird, long-stay, promo code, member — each
pinned to a property or the whole organisation, and each authorised at that
scope. A manager assigned to one property can price that property and is refused
an organisation-wide rule, which is the owner's call.

`value` is a whole percent or a minor-unit amount; nothing is stored as a float,
because money and binary fractions do not mix.

### Which discount applies

`src/lib/pricing/groupPricing.ts` is pure and tested. The rule is **best single
discount, never stacked** — stacking is how a platform gives away a stay, and a
guest reading "18% off" expects 18% off, not an unpredictable compound. Ties
break toward the offer about to expire.

### Campaigns

A scheduled bundle of discounts with public copy. Drafting and publishing are
different permissions (`campaign.update` vs `campaign.publish`), so a junior can
prepare a season without being able to put prices in front of the public. A
campaign with no active discounts is refused publication.

`GET /api/public/offers` is the one endpoint with no permission check, and it is
unauthenticated on purpose — a published campaign is an advertisement. It is a
projection built for the public: only LIVE campaigns, only inside their window,
and no tenant identifiers, redemption counts or draft rules.

### Group bookings & split payments

The differentiator for the journeys this platform serves. Twelve pilgrims travel
together; each owes a stated share and pays it themselves, instead of one person
fronting the cost and chasing the other eleven.

- The best applicable discount is found and applied when the group opens, and
  **the amount is stored** rather than recomputed — a rule edited next month
  cannot silently restate what a party was quoted.
- Shares split to the shilling with the remainder distributed, so they sum
  *exactly* to the amount owed. 100 across 3 is 34/33/33, never 33.33 three times.
- Adding a traveller rebalances only the **unpaid** shares. Money that has
  arrived is not a number to be revised.
- A group confirms only when every share is in — checked on the server, so a
  screen reading "95% collected" cannot be talked into confirming.
- The discount's redemption count increments **on confirmation**, not on opening.

## The promotional carousel

`src/components/marketplace/PromoCarousel.tsx`, on the home page above the
listing grid. Four slides — Hajj, Umrah, Marrakesh, Miami — asking a question
rather than announcing a discount, because "planning Hajj or Umrah?" meets
someone who already has the trip in mind.

Drawn entirely with CSS gradients and inline SVG, so it renders identically
offline, in the installed PWA and on a slow connection, with no layout shift
while a hero image decides whether to arrive. Green and navy throughout, with one
accent per destination.

Motion is a courtesy: it auto-advances, and pauses on hover, on keyboard focus,
when the tab is hidden, and permanently under `prefers-reduced-motion`. Arrow
keys and swipe work; off-screen slides are `inert`; the current slide is
announced once, politely.

## Transparent pricing

`src/lib/services/pricingService.ts` + `src/components/marketplace/PricePanel.tsx`.

One component behind the listing page and the checkout, so the two cannot drift
apart — a guest seeing one number on the listing and another at payment is the
exact failure this prevents. Two deliberate choices:

- **Our own margin is a named line.** The service fee says *"What PALTAS keeps —
  8%, stated up front"*. A marketplace that folds its cut into the nightly rate
  is not being transparent, it is being quiet.
- **The comparison states its assumption.** `feeComparison()` models a
  marketplace charging a 15% guest service fee, a nightly facility fee and tax
  added at checkout — figures held in the exported `TYPICAL_MARKETPLACE`
  constant. It is an illustrative industry model, **not a scrape of any named
  competitor**, and the panel says so where the number appears. A precise claim
  about a rival's live price would be the very dishonesty this feature argues
  against.

Listings can carry `priceFreeze`, which renders as *"Price frozen — this will not
change after you book."*

## Trust badges

`src/components/marketplace/TrustBadges.tsx`, backed by the `Verification` type.

The failure mode of every badge system is a sticker nobody can interrogate:
"Verified" alone means whatever the guest hopes it means, and stops reassuring
anyone the moment a booking goes wrong. Here each badge expands into the specific
check, the method and the month:

| Badge | What it certifies |
| --- | --- |
| ID verified | Government ID matched to the account holder |
| Ownership verified | Title deed or lease proving the right to let |
| Property inspected | Visited in person by a PALTAS inspector |
| Licensed | Short-let or tourism licence on file |
| Payouts verified | Payouts confirmed to a named bank account |

A badge with no backing `Verification` record is **not rendered at all** rather
than shown on trust. `TrustStrip` is the compact form for listing cards — a card
is a glance, so the evidence is one tap away on the listing itself.

## Payments — Stripe

### The split

| Where | What it holds |
| --- | --- |
| `src/server/stripe.ts` | The secret key, read from `STRIPE_SECRET_KEY`. Never logged, never returned. |
| `src/components/payments/StripeCheckout.tsx` | The publishable key only, and Stripe's own iframe. |

Card details are entered into Stripe's iframe and never touch this origin, which
is what keeps PALTAS out of PCI scope.

### The flow, server-first

1. The browser says *what* is being paid — a charge id, or one traveller's share.
2. The server looks up what is actually owed, creates the PaymentIntent, and
   returns **only** the client secret. **The browser never names a price.**
3. Stripe is confirmed in the browser against that secret.
4. **The webhook is the authority.** The ledger moves when Stripe tells the
   server it moved, not on the strength of the confirmation screen.

Idempotency is anchored on what is being paid, so a retried request resolves to
the same intent rather than a second charge. Webhook writes key on Stripe's own
intent id, and settlement is guarded by status, so a repeat delivery updates
nothing.

### Webhook verification

HMAC-SHA256 over `${timestamp}.${rawBody}`, timing-safe comparison, five-minute
replay window. The route reads `req.text()` because parsing and re-serialising
the JSON changes the bytes and the signature would not match.

An unverified webhook is a stranger asserting that a payment succeeded. Ten tests
cover it: forged signatures, wrong secret, replayed timestamps, malformed
headers, and signatures of the wrong length.

### Stripe Connect

Per-organisation, and in the database rather than the environment:

```
Organization.stripeAccountId          acct_… once onboarded
Organization.stripeOnboarded          false until Stripe confirms it
Organization.platformFeeBasisPoints   what PALTAS retains (250 = 2.5%)
```

With an account connected, `/api/payments/intent` issues a **destination
charge**: money settles into the owner's account and Stripe deducts the platform
fee. Without one, the identical code path charges the platform account — so
switching an owner on is a data change, not a deploy.

`/manage/payouts` reads status **from Stripe on every load**, not from the cached
flag, because an account can exist and look connected while Stripe waits on a
document. `chargesEnabled` and `payoutsEnabled` are reported separately and any
outstanding requirement is named. Telling an owner they are being paid when they
are not is the one thing that screen must never do.

### Key handling

- The app **refuses to start a payment** if an `sk_`/`rk_`/`mk_` value is found
  in any `NEXT_PUBLIC_` variable — Next.js compiles those into the browser bundle.
- `.env` is gitignored; `.env.example` carries placeholders and rolling instructions.
- Errors log `e.name` only. The catch never echoes an exception that could carry
  a header.

## Screens

| Route | What it is |
| --- | --- |
| `/manage` | Owner dashboard — portfolio, money, operations, security |
| `/manage/portfolio` | Portfolio → Property → Building → Unit → Resident → visitors / access / maintenance / payments |
| `/manage/security` | Paltas Security Management: gate console, visitors, cards & vehicles, guards & shifts, incidents, access history |
| `/manage/pricing` | Discounts and campaigns |
| `/manage/groups` | Group bookings and split payments |
| `/manage/listings` | Draft and publish properties to the marketplace |
| `/manage/finance` | Fee schedule, charges, collection — and pay by card |
| `/manage/payroll` | Salaries, pay runs and payslips |
| `/manage/rewards` | Paltas Rewards members and ledger |
| `/manage/payouts` | Stripe Connect and settlements |
| `/manage/staff` | Staff directory and the per-employee permission editor |
| `/manage/audit` | The audit trail |

Navigation is built from the signed-in user's permissions: a guard sees a Security
tab and nothing else, with no Finance link that 403s when clicked.

Where the API withholds a field for lack of permission it says so, and the UI
shows an explanation rather than a blank. An owner dashboard that quietly renders
`KSh 0` revenue to an administrator is worse than one that admits what it is not
showing. The unit drill-down returns a `sections` map naming exactly which blocks
were withheld.

---

## Tests

```bash
npm run verify          # typecheck + engine tests + route audit
npm run test:all        # everything, end to end
npm run test:auth       # 41 pure tests — authorisation + pricing, no database needed
npm run test:e2e        # 100 permission checks over real HTTP
npm run test:platform   # 17 cross-organisation checks
npm run test:commerce   # 38 pricing, group-booking and shopfront checks
npm run audit:routes    # the two structural invariants
```

Current state — 196 checks, all repeatable (each e2e script reseeds first):

```
engine (pure)            41 passed
permissions e2e         100 passed
platform e2e             17 passed
commerce e2e             38 passed

51 route files · 78 HTTP handlers
✓ Every handler authorises before acting.
✓ Every mutating handler leaves a record.
```

**`test:auth`** — 41 pure tests over the engine, group pricing and transparent pricing: deny-beats-allow, downward-only
inheritance, cross-organisation isolation, wildcard matching without prefix
bleed, suspended accounts, the scope filter, each system role's boundaries, and
John's worked example from the brief.

**`test:e2e`** — 100 checks over real HTTP, each account signing in for real.
This is the suite that matters, because the claim being tested is that the
*server* refuses, not that the browser hides. It needs a seeded database and a
running server:

```bash
npm run db:seed
PORT=3111 npm run dev
npm run test:e2e          # or PALTAS_URL=http://localhost:3000 npm run test:e2e
```

It covers, among others:

- the owner holds the whole catalogue; the guard holds exactly what the brief says
- `/finance/payments`, `/audit`, `/owner/dashboard`, `POST /staff`,
  `DELETE /properties/:id` all return 403 to the guard
- two property managers each see one property, and are refused the other by id
- a building-scoped supervisor sees one block — and the property counts reported
  to them describe only that block
- rent and resident contact details are absent from responses, with
  `rentVisible: false` / `contactVisible: false` saying so
- a delegate holding organisation-wide `staff.suspend` can suspend an ordinary
  account and is still refused on the owner, with `owner_protected`
- nobody can grant a permission they do not hold, or edit their own permissions
- a single-use pass refuses its second scan, and the second check-in 409s
- the same unit returns different blocks to the owner, a guard and an accountant
- suspending a card without a reason is refused; with one, it lands in the audit
  trail carrying the previous and new value
- a suspended account can no longer sign in

### Two bugs this suite caught

Worth recording, because both were invisible to the type checker and to the
build, and both were about the *building* level of the tree — the rung that is
easy to get right at property level and forget below it:

1. `/api/units` returned 500 for a building-scoped user. The generic
   `whereByPropertyOrUnit` helper emits a `unitId` clause, but on the `Unit`
   table the column is `id`. Fixed by giving the Unit and Building tables their
   own helpers (`whereForUnitTable`, `whereForBuildingTable`).
2. `/api/properties` reported whole-property counts to a building-scoped user —
   telling a Block B supervisor that the property has 6 units when she may see 2.
   A count is itself information about a part of the portfolio you were not
   given. Counts are now computed within the caller's own scope.
