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

This is a **complete, runnable, deployable frontend** running on realistic demo
data. It is **not yet** a live money-moving platform — that needs the backend
(database, real payments, ledger, auth, compliance) built against `API-CONTRACT.md`.
When that's ready, you flip one setting (`NEXT_PUBLIC_DATA_SOURCE=api`) and
redeploy — the site you deployed doesn't change.

Deploy the **Next.js app in this folder** — not any single `index.html` prototype.
