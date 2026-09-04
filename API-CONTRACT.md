# PALTAS — Backend API Contract (v1) — SUPERSEDED

> **This document describes a plan that was not taken, and it is kept for
> reference only. Do not build against it.**
>
> It proposed a separate backend service at `api.paltas.com`, reached with a
> bearer token, which the frontend would switch to by setting
> `NEXT_PUBLIC_DATA_SOURCE=api`.
>
> What was built instead: the backend is **in this repository**, as Next.js
> route handlers under `src/app/api/`, on **PostgreSQL via Prisma**, with
> session-cookie authentication. There is no separate service, no bearer token,
> and no data-source switch — that switch has been deleted, along with the mock
> services it chose between.
>
> For what actually exists, read `src/app/api/` (or run `npm run verify`, which
> prints every route and how it authorises).

PALTAS is a stays / real-estate marketplace. The "money moment" is a **booking
payment held in escrow and released to the host** — not a payments-transfer app.

---

## Conventions

- **Base URL**: `NEXT_PUBLIC_API_BASE_URL` (e.g. `https://api.paltas.com`).
- **Auth**: `Authorization: Bearer <token>` on every non-public call.
- **Content type**: `application/json` for requests and responses.
- **Response envelope**: every endpoint returns

  ```json
  { "data": <payload>, "error": null }
  ```

  or, on failure,

  ```json
  { "data": null, "error": { "code": "string", "message": "string" } }
  ```

  This mirrors the frontend's `Result<T>` type exactly.
- **Idempotency**: any state-changing money endpoint MUST accept an
  `idempotencyKey` and guarantee a repeated key never double-charges or
  double-books. Return the original result for a repeated key.
- **Currencies**: `"KES" | "USD" | "AED" | "EUR" | "GBP"`.
- **IDs**: opaque strings. The frontend never parses them.

---

## 1. Auth

### POST `/auth/sign-in`
Create or resume a guest session.

Request:
```json
{ "name": "Amina Otieno", "email": "amina@example.com" }
```
Response `data`:
```json
{ "id": "u_123", "name": "Amina Otieno", "email": "amina@example.com" }
```
Notes: real implementation issues the bearer token (cookie or body). MFA/RBAC
live behind this endpoint; the frontend only needs the `User`.

---

## 2. Listings (public — no auth required)

### GET `/listings?city=&mode=&guests=&maxPrice=`
`mode` ∈ `stays | hotel | rent | all`. Response `data` is `Listing[]`:
```json
[{
  "id": "l1",
  "name": "Beachfront Family Villa",
  "type": "villa",
  "location": "Nyali, Mombasa",
  "city": "Mombasa",
  "country": "Kenya",
  "price": 12800,
  "currency": "KES",
  "rating": 4.9,
  "reviewCount": 214,
  "beds": 4, "baths": 3, "maxGuests": 8,
  "amenities": ["wifi","pool","parking","kitchen","ac","beach"],
  "imageUrl": "https://…",
  "gallery": ["https://…","https://…"],
  "superhost": true,
  "chain": false,
  "stars": null,
  "hostId": "h1",
  "description": "…"
}]
```
`chain` (bool) and `stars` (3–5) apply to hotels and drive the escrow decision
(see §4). `type` ∈ `villa|apartment|studio|house|penthouse|suite|room|cottage|loft`.

### GET `/listings/{id}`
Response `data`: a single `Listing` (or `null` → 404 semantics via `error`).

### GET `/listings/{id}/reviews`
Response `data` is `Review[]`:
```json
[{ "id":"r1","author":"Sarah M.","initials":"SM","color":"#00a894",
   "stars":5,"date":"2 weeks ago","text":"…" }]
```

### GET `/listings/{id}/host`
Response `data` is `Host`:
```json
{ "id":"h1","name":"Amina Otieno","type":"Superhost","verified":true,
  "responseTime":"within an hour","rating":4.9,"reviews":214,"initials":"AO" }
```

---

## 3. Pricing (computed server-side, must match the client formula)

The frontend computes an all-in price for display; the backend is the source of
truth at payment time and MUST return the same breakdown. Formula today:

```
subtotal    = nightly * nights
cleaningFee = 1500 (flat, per booking)
serviceFee  = round(subtotal * 0.08)
taxes       = round((subtotal + cleaningFee + serviceFee) * 0.05)
total       = subtotal + cleaningFee + serviceFee + taxes
```

`PriceBreakdown`:
```json
{ "nightly":12800,"nights":3,"subtotal":38400,"cleaningFee":1500,
  "serviceFee":3072,"taxes":2149,"total":45121,"currency":"KES" }
```
If fees/taxes become dynamic, expose `GET /pricing/quote?listingId=&nights=`
returning `PriceBreakdown`; the frontend can adopt it without UI changes.

---

## 4. Escrow decision (business rule — keep server-authoritative)

Given a listing, decide escrow vs instant. Verified hotel chains (4–5★) pay out
instantly; everyone else uses escrow.

```
isHotel          = type ∈ {penthouse, suite, room}
stars            = listing.stars ?? (rating>=4.8?5 : rating>=4.5?4 : 3)
bigVerifiedHotel = isHotel AND chain==true AND stars>=4
escrow           = NOT bigVerifiedHotel
```
`PaymentMode` returned inside a booking:
```json
{ "escrow": true,  "reason": "Protected by PALTAS escrow" }
{ "escrow": false, "reason": "Verified 5-star hotel — instant confirmation", "stars": 5 }
```

---

## 5. Bookings (the core money journey)

### POST `/bookings`  (idempotent)
Create a booking: take payment via the chosen provider, then either hold in
escrow or confirm instantly. Request:
```json
{
  "listingId": "l1",
  "checkIn": "2025-08-30",
  "checkOut": "2025-09-02",
  "nights": 3,
  "guests": 2,
  "buyerId": "u_123",
  "buyerName": "Amina Otieno",
  "idempotencyKey": "bk_l1_u123_1712345678",
  "method": "card",
  "providerName": "stripe",
  "phone": null
}
```
`method` ∈ `card | apple_pay | google_pay | bank_transfer | mobile_money | appra_pay`.
`providerName` ∈ `stripe | appra-pay | mobile-money` (see §7). `phone` required
for `mobile_money`.

Response `data` is a `Booking` with full lifecycle + audit trail:
```json
{
  "id": "b_1712345678",
  "code": "PALTAS-X7K2Q",
  "idempotencyKey": "bk_l1_u123_1712345678",
  "listingId": "l1",
  "property": "Beachfront Family Villa",
  "location": "Nyali, Mombasa",
  "checkIn": "2025-08-30", "checkOut": "2025-09-02", "guests": 2,
  "breakdown": { "...": "PriceBreakdown" },
  "paymentMode": { "escrow": true, "reason": "Protected by PALTAS escrow" },
  "escrowId": "esc_…",
  "status": "held",
  "reference": "PX-AB12CD",
  "failureReason": null,
  "events": [
    { "status": "processing", "at": 1712345678000, "note": "Payment initiated" },
    { "status": "held", "at": 1712345679000, "note": "Payment received — funds held in escrow" }
  ],
  "createdAt": 1712345678000
}
```
`status` ∈ `draft | processing | confirmed | held | completed | failed | reversed | disputed`.

**Async methods** (mobile money, bank transfer): the charge returns `pending`;
the frontend polls (or you push) until the network callback resolves it to
`held`/`confirmed` or `failed`. Model this with the provider `confirm` step (§7).

**Failed payment**: return the `Booking` with `status:"failed"` and a
`failureReason`; the guest was **not** charged. Do not error the request.

### POST `/bookings/get`  →  `{ "id": "b_…" }` → `data`: `Booking | null`

### POST `/bookings/search`  →  `{ "buyerId": "u_123" }` → `data`: `Booking[]`

### POST `/bookings/{id}/reverse`
Refund/reverse to the guest. `data`: `Booking` with `status:"reversed"` and a
new event appended.

---

## 6. Escrow (two-sided release)

Funds release only when **both** buyer and host confirm.

### POST `/escrow`  → create a hold (usually called internally by `/bookings`).
Request mirrors the booking's escrow fields; `data` is `EscrowTransaction`:
```json
{
  "id":"esc_1","code":"PALTAS-X7K2Q","kind":"booking",
  "property":"Beachfront Family Villa","location":"Nyali, Mombasa",
  "amount":45121,"currency":"KES",
  "buyerId":"u_123","buyerName":"Amina Otieno",
  "host": { "...": "Host" },
  "dates":"2025-08-30 – 2025-09-02","guests":2,
  "status":"held","buyerConfirmed":false,"hostConfirmed":false,
  "createdAt":1712345678000
}
```
`status` ∈ `held | released | disputed`.

### POST `/escrow/{id}/confirm-buyer` → sets `buyerConfirmed`, settles if both true.
### POST `/escrow/{id}/confirm-host`  → sets `hostConfirmed`, settles if both true.
### POST `/escrow/{id}/dispute`        → `status:"disputed"`.
### POST `/escrow/search` → `{ "buyerId":"u_123" }` → `data`: `EscrowTransaction[]`.

**Settlement rule** (server-authoritative): when `buyerConfirmed && hostConfirmed`,
set `status:"released"` and trigger payout to the host via the settlement
partner. Never release on one side alone.

---

## 7. Payment providers (webhooks are the source of truth)

The frontend selects a `(method, providerName)` pair; the backend routes to that
provider. **Secret keys live only on the backend.** Settlement status is
whatever the provider's **webhook** tells you — never the client.

### Stripe (`stripe`) — card, apple_pay, google_pay, bank_transfer
- `POST /payments/stripe/create-intent` `{ amount, currency, method, idempotencyKey }`
  → `{ clientSecret, reference }`. Client confirms with Stripe.js (publishable key).
- Webhook `POST /webhooks/stripe` — verify signature; on `payment_intent.succeeded`
  mark the booking `held`/`confirmed`; on failure mark `failed`.

### Appra Pay (`appra-pay`) — gateway: card, bank_transfer
- `POST /payments/appra/charge` `{ amount, currency, method, idempotencyKey }`
  → `{ reference, status }`.
- Webhook `POST /webhooks/appra` — verify; resolve pending → settled/failed.

### Mobile money (`mobile-money`) — all major African networks
- `POST /payments/mobile-money/stk-push` `{ amount, currency, phone, idempotencyKey }`
  → `{ reference, status: "pending" }` and triggers the STK push to the handset.
- Webhook `POST /webhooks/mobile-money` — the network callback; resolve
  `pending → succeeded | failed`. The frontend shows "approve on your phone"
  while pending.

All three return a `PaymentIntent` shape to the booking flow:
```json
{ "reference":"PX-…","status":"succeeded|pending|failed",
  "amount":45121,"currency":"KES","provider":"stripe","method":"card",
  "failureReason":null,"pendingHint":null }
```

Also expected (same interface): `refund(reference)`, and for async rails a
`confirm(reference)` the backend can expose as
`GET /payments/{provider}/status?reference=`.

---

## 8. Role portals

All portal endpoints require auth + the caller's role (RBAC). Responses are the
typed arrays the portal UIs already consume.

### Hotel
- `GET /portal/hotel/rooms` → `HotelRoom[]`
  ```json
  [{ "id":"hr1","name":"Standard Double","rate":8500,"currency":"KES",
     "total":40,"available":12,"beds":"1 Queen","status":"active" }]
  ```
- `GET /portal/hotel/bookings` → `HotelBooking[]`
  ```json
  [{ "id":"hb1","guest":"Sarah Mwangi","room":"Deluxe King",
     "checkIn":"26 Aug","checkOut":"29 Aug","amount":36000,"currency":"KES",
     "status":"confirmed" }]
  ```
  `status` ∈ `confirmed | checked_in | checked_out | cancelled`.
- `POST /portal/hotel/rooms/{id}/rate` `{ "rate": 9000 }` → updated `HotelRoom`.
- `POST /portal/hotel/rooms/{id}/availability` `{ "available": 5 }` → updated `HotelRoom`.
- `POST /portal/hotel/rooms` `{ "name","rate","total","beds" }` → new `HotelRoom`.

### Landlord
- `GET /portal/landlord/units` → `Unit[]` — `status` ∈ `occupied | vacant | notice`.
- `GET /portal/landlord/tenants` → `Tenant[]` — `rentStatus` ∈ `paid | due | overdue`.
- `GET /portal/landlord/maintenance` → `MaintenanceTicket[]` — `status` ∈ `open | in_progress | resolved`.
- `POST /portal/landlord/tenants` `{ "name","unitName","rent" }` → new `Tenant`.
- `POST /portal/landlord/tenants/{id}/remind` → `{ "sent": true }`.
- `POST /portal/landlord/maintenance/{id}/resolve` → updated `MaintenanceTicket`.

### Agent
- `GET /portal/agent/listings` → `AgentListing[]` — `status` ∈ `live | under_offer | sold | draft`.
- `GET /portal/agent/leads` → `Lead[]` — `stage` ∈ `new | contacted | viewing | offer | closed`.
- `GET /portal/agent/viewings` → `Viewing[]` — `status` ∈ `scheduled | completed | cancelled`.
- `POST /portal/agent/leads/{id}/advance` → updated `Lead` (moves to next stage).

### Developer
- `GET /portal/developer/projects` → `Project[]` — `status` ∈ `planning | selling | completed`.
- `GET /portal/developer/projects/{id}/units` → `ProjectUnit[]` — `status` ∈ `available | reserved | sold`.
- `GET /portal/developer/leads` → `DeveloperLead[]` — `stage` ∈ `enquiry | reserved | deposit | completed`.
- `POST /portal/developer/units/{id}/sell` → updated `ProjectUnit` (and increments the project's `sold`).

---

## 9. Cross-cutting backend requirements

These are not new endpoints but obligations the spec calls for:

- **Double-entry ledger** behind bookings/escrow/settlement; every money movement
  posts balanced entries. The API responses above are read models over it.
- **Idempotency** on all money-mutating endpoints (§5, §7).
- **Webhook signature verification** on every `POST /webhooks/*` (§7).
- **RBAC** on all `/portal/*` routes; a landlord can't read a hotel's data.
- **Audit log** of every state transition (the booking `events[]` is the
  user-facing slice of this).
- **Reconciliation** job matching provider settlements ↔ ledger ↔ bookings.
- **Encryption** at rest for PII; **secrets** in a vault, never in the frontend.

---

## 10. Go-live switch

1. Implement the endpoints above; keep response shapes identical to the models.
2. Point the frontend at the backend:
   ```
   NEXT_PUBLIC_DATA_SOURCE=api
   NEXT_PUBLIC_API_BASE_URL=https://api.paltas.com
   ```
3. Wire the real provider keys + webhooks (§7) on the backend only.
4. No frontend rebuild — the service layer swaps mock → api by config.

The exact TypeScript source of truth for every shape here is
`src/lib/models/index.ts` and `src/lib/providers/interfaces.ts`.
