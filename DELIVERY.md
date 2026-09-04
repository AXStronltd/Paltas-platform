# PALTAS — Delivery Guide

> **Partly historical.** Instructions mentioning `NEXT_PUBLIC_DATA_SOURCE`
> describe a separate-backend plan that was not taken. That variable no longer
> exists; see `render.yaml` for what the deployment actually sets.


This package is the **production-grade frontend** for PALTAS Smart Living
(stays / real-estate marketplace). It runs today with realistic mock data and is
built so your backend connects later **without any frontend rebuild**.

---

## 1. Run it locally (2 minutes)

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. That's the whole platform — browse stays, book with
escrow, and open the four role portals from the header.

Production build (what deployment runs):

```bash
npm run build
npm start
```

Type-check only:

```bash
npm run typecheck
```

---

## 2. Deploy it to a live URL (working demo)

The app is a standard Next.js 14 app — it deploys zero-config on Vercel or
Netlify. Configs for both are included.

### Option A — Vercel (recommended, easiest)
1. Push this folder to a Git repo (GitHub/GitLab).
2. On <https://vercel.com> → **New Project** → import the repo.
3. Framework auto-detects as **Next.js**. Click **Deploy**.
4. Done — you get a live `https://…vercel.app` URL.

(Or from your machine: `npm i -g vercel && vercel`.)

### Option B — Netlify
1. Push to a Git repo.
2. On <https://netlify.com> → **Add new site** → import the repo.
3. `netlify.toml` sets the build; the Next.js plugin handles the rest. Deploy.

No environment variables are required for the demo — it runs on mock data.

---

## 3. Connect the backend later (no frontend rebuild)

When your backend implements `API-CONTRACT.md`:

1. Copy `.env.example` → `.env.local` and set:
   ```
   NEXT_PUBLIC_DATA_SOURCE=api
   NEXT_PUBLIC_API_BASE_URL=https://api.paltas.com
   ```
2. Wire real payment provider **secret** keys + webhooks **on the backend only**
   (never in this frontend). Publishable keys go in `.env.local`.
3. Redeploy. The service layer switches mock → api by config; pages, components,
   and journeys are unchanged.

---

## 4. What's built (done) ✅

**Guest journey — complete, all states**
- Marketplace: filters, transparent all-in pricing, escrow/instant badges
- Listing detail: gallery, verified host, reviews, trust strip
- Checkout state machine: account → payment method → review → processing →
  completed / failed → receipt (with reference)
- Payment method selection: **Stripe** (card, Apple/Google Pay, bank),
  **Appra Pay** (gateway), **Mobile money** (STK-push pending flow)
- Escrow: two-sided confirm & release, completion, dispute
- My bookings + receipts

**Business side — four role portals, working states**
- Hotel: occupancy, rooms & rates, availability grid, bookings
- Landlord: units, tenants, rent status, maintenance (resolve works)
- Agent: listings, leads pipeline (advance works), viewings
- Developer: projects, units (mark sold works), sales leads

**Architecture — API-ready**
- Service layer = the mock⇄API boundary (one switch)
- Provider abstraction: `PaymentProvider`, `EscrowProvider`, `KYCProvider`,
  `NotificationProvider` — swap providers via `registry.ts`
- Typed domain models are the single source of truth
- Booking state machine with idempotency keys + event/audit trail
- Loading, empty, success, error, pending, failed states throughout
- Mobile responsive; PWA manifest included

**Docs**
- `API-CONTRACT.md` — exact backend endpoints + JSON shapes
- `PALTAS-CODEBASE.md` — the whole source in one reference file

---

## 5. What the backend team must build (not in this package) ⛔

This is a frontend package. Making it a live, money-moving platform requires
backend engineering + accounts + compliance that cannot live in the frontend:

- Backend API implementing `API-CONTRACT.md` (database, business logic)
- **Double-entry ledger**, settlement, reconciliation
- Real payment provider accounts + **secret keys + webhook verification**
  (Stripe, Appra Pay, mobile money)
- Authentication, **MFA**, sessions, **RBAC** on portal routes
- KYC/host verification integration
- Encryption at rest, secrets vault, audit logging
- CI/CD, staging/prod separation, monitoring, alerting, backups, DR
- Unit / integration / e2e / load / security testing at scale
- Regulatory & compliance sign-off before handling real funds

The frontend is designed against these — every integration point is marked with
`// API:` (services) and `// REAL:` (providers).

---

## 6. Project structure

```
src/
  app/                 routes (home, listing/[id], bookings, portal/*)
  components/
    ui/                Header, TabBar, PWARegister
    marketplace/       Marketplace, ListingCard, ListingDetail
    booking/           CheckoutModal (state machine), MyBookings
    portal/            PortalShell + Hotel/Landlord/Agent/Developer
  lib/
    models/            typed domain contracts (source of truth)
    config/            mock ⇄ api switch
    data/              mock seed data
    providers/         payment/escrow/kyc/notification interfaces + impls
    services/          THE API BOUNDARY (mock today, api later)
  styles/              design tokens + component CSS
```

---

## 7. Honest status line

This is a **complete, runnable, deployable frontend** — ready to demo on a live
URL and ready for a backend team to make real. It is **not** a live financial
platform yet; that is the backend + compliance work above, built against the
included contract.
