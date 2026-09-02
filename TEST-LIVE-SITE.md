# PALTAS — What to Test on Your Live Site (netlify.app / vercel.app)

Once PALTAS is deployed and you have a live URL (e.g. `paltas.netlify.app`), open
it and walk this checklist. It takes ~10 minutes and confirms the whole platform
works end-to-end. Test on a **phone and a laptop** if you can.

Tip: it works best in a normal browser tab. Try it once logged-out (fresh).

---

## 1. Home / Marketplace
- [ ] The page loads with the hero "Find your next place to stay."
- [ ] Property **photos actually appear** (not grey boxes). On the live site they
      should load — if they're grey, the site didn't build with internet access.
- [ ] The filter chips work: click **Short stays / Hotels / Long-term rent** and
      the list changes.
- [ ] Each card shows the **all-in price** ("KSh … total / night · all fees
      included").
- [ ] Badges are correct: most cards say **🔒 Escrow protected**; the
      **Sarova Grand Hotel** says **⚡ Instant confirmation**.

## 2. Listing detail
- [ ] Click any card → it opens the property page (gallery, host, reviews).
- [ ] The **verified host** card shows (name, ✓ Verified, rating).
- [ ] The booking box shows the trust strip (Verified host · Escrow · No hidden
      fees) and a full price breakdown with **taxes** and a total.
- [ ] **← Back to stays** returns you to the list.

## 3. Booking journey (the important one)
- [ ] Click **Reserve now**.
- [ ] Fill name + email → **Create account & continue**.
- [ ] **"How would you like to pay?"** appears with options:
      Card / Apple Pay / Google Pay / Bank transfer (Stripe),
      Card / Bank transfer (Appra Pay), **Mobile money**.
- [ ] Pick **Card** → Continue → Review shows the total → **Confirm & pay**.
- [ ] You see a **Processing** spinner, then a **success screen with a receipt**
      (reference like `PX-…`, booking code, amount, status 🔒 Held in escrow).
- [ ] **Test the failure path:** book again, on the Review step tick
      **"Simulate a failed payment"** → you should get a red **Payment failed**
      screen saying "you have not been charged" with **Try again**.
- [ ] **Test mobile money:** pick Mobile money → enter a phone number →
      it shows "approve on your phone", waits, then **succeeds** with a receipt.

## 4. My bookings + escrow
- [ ] Go to **My bookings** (top nav). Your booking is listed with the host.
- [ ] It shows **"You not yet / Host not yet."**
- [ ] Click **Confirm & release funds** → your side shows ✓, "waiting on host."
- [ ] Click **Confirm as host (demo)** → both sides ✓ and a green
      **"Booking complete — funds released 🎉"** banner appears.

## 5. The four portals (top nav)
**Hotel**
- [ ] KPIs load (occupancy, rooms available, arrivals, revenue).
- [ ] **Rooms & rates** → click **Edit rate** on a room, enter a number → the
      rate updates.
- [ ] **Availability** shows the coloured 7-day grid. **Bookings** shows guests
      with status pills.

**Landlord**
- [ ] KPIs load. Rent status shows Paid / Due / Overdue pills.
- [ ] **Maintenance** tab → click **Resolve** on a ticket → it flips to Resolved.

**Agent**
- [ ] KPIs load. On a lead, click **Advance →** → it moves to the next stage
      and a toast confirms.

**Developer**
- [ ] Projects show with progress bars. Click a project → it opens its **Units**.
- [ ] Click **Mark sold** on an available unit → it becomes Sold.

## 6. Mobile check (open the URL on your phone)
- [ ] No sideways scrolling; everything fits the screen.
- [ ] The bottom tab bar (Stays / Bookings / Account) shows.
- [ ] The booking flow and a couple of portals are usable with your thumb.

## 7. Basics
- [ ] The address bar shows a **padlock / https://** (Netlify/Vercel add this
      automatically).
- [ ] Refreshing any page (e.g. a portal) doesn't 404 — it reloads fine.
- [ ] No obvious broken buttons — every button does something / goes somewhere.

---

## What is EXPECTED to be "demo only" right now (not a bug)

Because the backend isn't connected yet, these are intentional at this stage:

- **Data resets on refresh.** A booking you made or a rate you edited disappears
  after reload. That's mock data — it becomes permanent once the backend is on.
- **No real money moves.** "Pay" doesn't charge a real card; mobile money doesn't
  really prompt a phone. The flow and states are real; the settlement is mocked.
- **No real emails/SMS** are sent.
- **Logins aren't real accounts** — there's no password check yet.

All of these turn real when your backend is connected (see `API-CONTRACT.md`),
without changing the site you deployed.

## If something IS broken

- **Photos are grey** → the build ran without internet; redeploy on Netlify/Vercel
  (they build with internet, so photos load).
- **A portal page 404s on refresh** → make sure you deployed the **Next.js app**
  (`paltas-app`), not the single `index.html`, and that the Next.js plugin is
  enabled on Netlify (it's in the included `netlify.toml`).
- **Build failed on Netlify/Vercel** → you likely uploaded `node_modules` or
  `.next`. Remove them from the repo and redeploy.
- **A button does nothing** → note which page + button and it can be fixed; the
  app was tested with zero dead buttons, so this would be environment-specific.

---

### One-line summary
Open the live URL → browse → book (success + fail + mobile money) → release escrow
→ click through all four portals → check it on your phone. If those work, the
platform is live and correct — money-movement turns on when the backend connects.
