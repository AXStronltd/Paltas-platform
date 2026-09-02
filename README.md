# PALTAS — Smart Living

A global stays & real-estate marketplace. Next.js + TypeScript.

## Features
- Luxury animated hero + search
- 13 smart discovery rows with endless horizontal carousels
- Full booking flow (instant confirmation)
- Real login (Supabase) — add keys to enable
- 4 business portals: Hotel, Landlord, Agent, Developer
- Mobile + PWA, responsive full-width design
- Payment provider layer (Stripe, Appra Pay, Mobile Money) — ready to connect

## Run locally
```
npm install
npm run dev
```
Open http://localhost:3000

## Deploy (Netlify)
Push to GitHub → import repo to Netlify → Deploy. `netlify.toml` handles the build.

## Enable real login (optional)
Create a free project at supabase.com, then set env vars (in Netlify → Site settings → Environment variables):
```
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```
Without them, the app runs in demo mode.
