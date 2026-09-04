# PALTAS Smart Living — Start Here

This package contains the **complete PALTAS frontend** (Next.js + TypeScript) plus
all documentation. Everything you need to run it, deploy it, test it, and hand it
to a backend team.

## 📖 Read in this order

1. **DELIVERY.md** — what's built, how to run it, what the backend team must add.
2. **DEPLOY-TO-paltashub.md** — step-by-step to put it live on your domain (no coding).
3. **TEST-LIVE-SITE.md** — what to click/test once it's live to confirm it works.
4. **API-CONTRACT.md** — the exact backend endpoints + JSON (for your developers).
5. **PALTAS-CODEBASE.md** — the entire source in one file (for reading/reviewing).
6. **README.md** — short architecture overview.

## 🚀 Run it now (2 commands)

Requires Node.js 18+ (free from nodejs.org).

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## 📁 What's the actual product?

The app itself is the **`src/`** folder + config files. That's what deploys.
The `.md` files are documentation and don't affect the app.

## ⚠️ Honest status

This is a **full-stack application**, not a frontend waiting for a backend. It
runs on PostgreSQL through Prisma, with its own API routes under `src/app/api/`,
session-cookie authentication, an approval flow for new organisations, Stripe
payments, and a payout ledger.

There is **no mock mode**. The switch that used to claim otherwise has been
deleted; `API-CONTRACT.md` describes a separate-backend plan that was not taken
and is kept only for reference.

What is genuinely not finished is listed honestly in the README and in the
commit history — chiefly that no real money has moved yet, and that the fifteen
translations have not been read by native speakers.

Deploy the **Next.js app in this folder** — not any single `index.html` prototype.
