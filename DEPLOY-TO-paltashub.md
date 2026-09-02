# Deploy PALTAS to paltashub.com — Step by Step

This gets the PALTAS app (`paltas-app`) live on your domain. No coding needed —
just clicks and copy-paste. Takes about 20 minutes. Free.

You need three accounts (all free): **GitHub**, **Vercel**, and access to wherever
you bought **paltashub.com** (the domain registrar).

---

## PART 1 — Put the code on GitHub (5 min)

GitHub stores the code so Vercel can read it.

1. Unzip `paltas-app.zip` on your computer. You'll get a folder called `paltas-app`.
2. Go to <https://github.com> → sign up / log in.
3. Click the **+** (top right) → **New repository**.
4. Name it `paltas-app`. Leave it **Private**. Click **Create repository**.
5. On the next page, choose **"uploading an existing file"** (a link in the text).
6. Drag the **contents** of the `paltas-app` folder into the upload box
   (the `src` folder, `package.json`, etc. — not the outer folder itself).
   - Do NOT upload `node_modules` or `.next` if they exist — skip those.
7. Click **Commit changes**. Your code is now on GitHub.

> Prefer a tool over dragging files? GitHub Desktop (<https://desktop.github.com>)
> does the same thing with an "Add existing repository" button.

---

## PART 2 — Deploy on Vercel (5 min)

Vercel runs the app and gives it a live web address.

1. Go to <https://vercel.com> → **Sign up** → choose **Continue with GitHub**
   (this links the two accounts).
2. Click **Add New… → Project**.
3. Find `paltas-app` in the list → click **Import**.
4. Vercel auto-detects it as **Next.js**. Don't change any settings.
5. Click **Deploy**. Wait ~2 minutes.
6. You'll see 🎉 and a live URL like `https://paltas-app-xxxx.vercel.app`.
   Click it — that's your whole platform live on the internet.

At this point PALTAS is live on a Vercel URL. Next we point your own domain at it.

---

## PART 3 — Connect paltashub.com (10 min + waiting)

1. In Vercel, open your project → **Settings** (top menu) → **Domains** (left menu).
2. Type `paltashub.com` in the box → click **Add**.
3. Vercel will also offer `www.paltashub.com` — add that too (recommended).
4. Vercel now shows you **DNS records** to add. It will look like one of these:

   **If it gives you an A record (for the root domain):**
   ```
   Type: A
   Name: @
   Value: 76.76.21.21        ← use the exact number Vercel shows you
   ```

   **And a CNAME (for www):**
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com   ← use exactly what Vercel shows
   ```

5. Open a second tab → log in to **where you bought paltashub.com**
   (GoDaddy, Namecheap, Google Domains, Truehost, etc.).
6. Find the **DNS settings / DNS management / DNS records** page for paltashub.com.
7. Add the records **exactly** as Vercel showed them (copy-paste the values).
   - If an old A record or "parking" record exists for `@`, replace/delete it.
8. Save. Go back to the Vercel Domains page.
9. Wait. DNS can take anywhere from **10 minutes to a few hours** to update.
   Vercel shows a ✅ next to the domain when it's ready. The HTTPS padlock is
   set up automatically — you don't do anything for that.

When it shows ✅, open <https://paltashub.com> — PALTAS is live on your domain.

---

## What "live" means right now (important, honest)

What you just deployed is the **product front-end running on realistic demo data**.
Everyone can browse stays, go through booking/escrow, see payment options, and open
the Hotel/Landlord/Agent/Developer portals. It looks and behaves like the real
platform.

It is **not yet moving real money** — no real payments, no live database. That's
the backend stage, and it's expected. The good news: when your developers build the
backend (using `API-CONTRACT.md`), you do **not** deploy a different website. You
just:

1. In Vercel → project → **Settings → Environment Variables**, add:
   ```
   NEXT_PUBLIC_DATA_SOURCE = api
   NEXT_PUBLIC_API_BASE_URL = https://api.paltashub.com   (your backend URL)
   ```
2. Click **Redeploy**.

Same site, same domain — now connected to the real backend. No rebuild.

---

## Updating the site later

Any time the code changes: upload the new files to the same GitHub repo (or push
with GitHub Desktop). Vercel **automatically redeploys** within a minute. You never
touch the domain settings again.

---

## Quick troubleshooting

- **"Domain not verified" / no ✅ after an hour** → double-check the DNS values are
  copied exactly, and that you removed any old A record on `@`. Some registrars are
  slow; give it up to 24h.
- **Site works on the `.vercel.app` URL but not paltashub.com** → it's always a DNS
  record issue at the registrar, not the app. Re-check Part 3, steps 4–7.
- **Build failed on Vercel** → make sure you did NOT upload `node_modules` or
  `.next`. Delete them from the repo and Vercel will rebuild.
- **Want a hand?** Send this page to any web developer — it's a standard Next.js +
  Vercel deploy and takes them 10 minutes.

---

### One-line summary
Upload `paltas-app` to GitHub → import to Vercel → Deploy → add `paltashub.com` in
Vercel Domains → paste the DNS records at your registrar → wait for ✅.
