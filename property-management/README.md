# PALTAS — Property Management

A full-stack property operations platform: **Node.js API** (Express + SQLite + Drizzle +
WebSockets) and a **reactive React client** (Vite + TypeScript + Tailwind + TanStack Query),
in one npm workspace.

The point of the architecture is that nothing on screen is a constant. Every KPI, badge and
table is computed from the database on read, so approving a payment in one browser tab makes
the counter drop in another one without a refresh.

```bash
npm run setup     # install, build shared types, create + seed the database
npm run dev       # API on :4000, client on :5173
```

Open <http://localhost:5173>. Open it **twice**, side by side, and approve something — that is
the whole demo.

---

## Getting it onto GitHub

The repo is already initialised with one commit. To push it:

```bash
# create the repo on github.com first (private is sensible — it carries seed data),
# then, from this folder:
git remote add origin https://github.com/<your-account>/property-management.git
git push -u origin main
```

If you have the GitHub CLI, `gh repo create property-management --private --source=. --push`
does both steps in one.

## Opening it in VS Code

```bash
code .
```

VS Code will offer the recommended extensions on first open (ESLint, Prettier, Tailwind
IntelliSense, Playwright, a SQLite viewer). The workspace is preconfigured:

- **Run → Start Debugging → Debug full stack** launches the API with breakpoints and opens
  the client in Chrome, both attached.
- **Terminal → Run Task** offers *Setup*, *Dev*, *Typecheck*, *Build all* and *Reset database*.
- The editor uses the workspace TypeScript, so the red squiggles match `npm run typecheck`
  rather than a different compiler version.

---

## Scripts

| From the repo root | What it does |
| --- | --- |
| `npm run setup` | Install, build `@paltas/shared`, migrate and seed the database |
| `npm run dev` | Run API and client together with colour-coded logs |
| `npm run build` | Build all three workspaces |
| `npm run typecheck` | `tsc --noEmit` across every workspace |
| `npm run db:generate` | Emit a migration after changing `schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Reseed (destructive to seeded tables) |
| `npm run db:reset` | Delete the database, re-migrate, reseed |
| `npm start` | Run the built API in production |

---

## Layout

```
paltas/
├─ packages/shared/          types + seed data, compiled and imported by both sides
│  └─ src/
│     ├─ types.ts            the API contract — Property, Tenant, Metrics, LiveEvent…
│     └─ seed.ts             the demo dataset the database is seeded from
│
├─ apps/server/              Node 20 · Express · Drizzle · better-sqlite3 · ws
│  ├─ drizzle/               generated SQL migrations (committed)
│  └─ src/
│     ├─ index.ts            HTTP + WebSocket bootstrap, error handling
│     ├─ env.ts              config, read once
│     ├─ realtime.ts         socket hub: broadcast, presence, heartbeat
│     ├─ db/
│     │  ├─ schema.ts        10 tables
│     │  ├─ index.ts         connection, WAL mode, foreign keys
│     │  ├─ migrate.ts       apply migrations
│     │  ├─ seed.ts          seed from @paltas/shared
│     │  └─ reset.ts         drop → migrate → seed
│     ├─ lib/
│     │  ├─ metrics.ts       KPIs computed with SQL aggregates
│     │  └─ activity.ts      audit row + broadcast, together
│     └─ routes/index.ts     REST endpoints
│
└─ apps/web/                 React 18 · Vite · Tailwind · TanStack Query
   └─ src/
      ├─ api/
      │  ├─ client.ts        fetch wrapper + typed ApiError
      │  ├─ queries.ts       every query and mutation, with optimistic updates
      │  └─ live.tsx         one WebSocket → cache invalidations
      ├─ components/         Icon · layout · ui (20 typed components)
      ├─ config/nav.ts       29 sections; badges bind to live metrics
      └─ sections/           one file per domain group
```

---

## How reactivity actually works

Three layers, each doing one job:

**1. The server owns the truth.** `/api/metrics` runs `count(*)` and `sum()` over the tables
on every request. There is no cached KPI to go stale.

```ts
const pendingApprovals = db.select({ count: sql`count(*)` })
  .from(approvals).where(eq(approvals.status, 'pending')).all()
```

**2. Every mutation records and broadcasts.** One helper does both, so no route can change
data without publishing it:

```ts
record({ action: 'Approved', subject: item.title, module: 'Approvals' }, ['approvals'])
// → writes an activity row
// → broadcasts { type: 'invalidate', keys: ['approvals', 'activity', 'metrics'] }
```

**3. The client turns pushes into invalidations.** `LiveProvider` holds one socket for the
whole app:

```ts
for (const key of event.keys) queryClient.invalidateQueries({ queryKey: [key] })
```

TanStack Query refetches only what is on screen. Mutations also apply an optimistic update
first, so the tab that clicked feels instant while the others catch up over the socket.

A 60-second background refetch and refetch-on-focus sit underneath as a safety net. The socket
is what makes it feel live; polling is only the fallback if the socket ever drops — and it
reconnects on its own with exponential backoff, so restarting the API during development heals
without a page reload.

---

## What is genuinely live

Every one of these is verified end to end (approve in tab A, watch tab B):

| Action | Writes | Recomputes |
| --- | --- | --- |
| Approve / decline an approval | `approvals.status`, `decided_by`, `decided_at` | Approvals badge, KPI, Decided tab |
| Tick a priority or resolve an alert | `tasks.done` | Command Center badge, "N of M remaining" |
| Advance or close a work order | `work_orders.status` | Maintenance badge, kanban columns, SLA count |
| Raise a work order | new `work_orders` row | Maintenance badge, board, table |
| Toggle a workflow | `workflows.enabled` | Automations badge |
| Record a tenant payment | `tenants.arrears` | Rentals badge, arrears total, ageing |

Each also appends to `activity`, which surfaces in **Notifications → Live activity** in every
connected browser, and the top strip shows the socket state and how many clients are attached.

| Reprice a unit | `units.price` | Pricing table, vacancy table, repricing impact |
| Run the monthly rent collection | every `tenants.arrears` in arrears | Rentals badge, arrears total, Payments panel |
| Approve the whole queue at once | every pending `approvals` row | Approvals badge, KPI, Decided tab |
| Mark all notifications read | every open `tasks` row | Command Center badge, inbox |
| Add / edit / remove any business record | `records` row | That table, its tab badge, sidebar badge |
| Import a CSV | many `records` rows | Same |
| Switch subscription plan | `records` (single-select across the kind) | Plan cards |

### Nothing is hard-coded

Every list in the app is stored and fetched. The 66 tables that used to be literal arrays in
React files — vendors, contracts, purchase orders, campaigns, incidents, roles, the lot — moved
into the `records` table described below, seeded with exactly the data they held before. Tab
badges and sidebar badges bind to a computed metric or a record count; none is a fixed number.
The daily inbox, the audit timeline and the "recommended actions" list are derived from the
`activity`, `documents` and `approvals` tables, so they change as you work.

There are no dead controls. Every button either writes to the API, downloads a file the server
generated, or navigates. Where an action is genuinely unavailable — a unit already at its market
price — the button is disabled and its tooltip says why, rather than firing a toast that
pretends something happened.

---

## API

```
GET    /api/health                    { ok, clients, uptime }
GET    /api/metrics                   computed KPIs
GET    /api/properties
GET    /api/units?status=available
GET    /api/tenants
GET    /api/leads
GET    /api/work-orders
GET    /api/approvals?status=pending
GET    /api/workflows
GET    /api/tasks?kind=priority|alert
GET    /api/entities                  group tree, rebuilt from the flat table
GET    /api/activity?limit=40
GET    /api/activity/export.csv?module=   audit trail as CSV

GET    /api/record-types                  the whole registry + row counts
GET    /api/records/:kind                 one collection
GET    /api/records/:kind/export.csv      that collection as CSV
POST   /api/records/:kind                 create, validated against the registry
POST   /api/records/:kind/import          bulk CSV import
POST   /api/records/:kind/:id/select      single-select within a kind
PATCH  /api/records/:kind/:id             partial update
DELETE /api/records/:kind/:id

PATCH  /api/approvals/:id             { status, note?, actor? }
PATCH  /api/tasks/:id                 { done }
PATCH  /api/workflows/:id             { enabled }
PATCH  /api/work-orders/:id           { status?, assignee? }
POST   /api/work-orders               { issue, location, priority, assignee?, cost? }
POST   /api/tenants/:id/payment       { amount }
POST   /api/tenants/rent-run          applies scheduled rent against arrears
POST   /api/properties                { name, location, country, type, units, valuation }
POST   /api/units                     { name, propertyId, type, price, status }
PATCH  /api/units/:id                 { price?, status? }
POST   /api/leads                     { name, contact, interest, source, ... }
POST   /api/tenants                   { name, unit, property, rent, ... }
POST   /api/tasks                     { title, detail?, kind?, tone? }
POST   /api/tasks/read-all            marks every open alert read
POST   /api/approvals/decide-many     { ids[], status }

WS     /live                          hello · presence · invalidate
```

Request bodies are validated with Zod. A validation failure is a 400 with the issues attached;
anything else is a 500. Deciding an already-decided approval returns 409 with the current row,
so two people clicking at once cannot both win.

---

## Configuration

Development needs no `.env` — Vite proxies `/api` and `/live` to `localhost:4000`, so the
browser sees one origin and CORS never comes up. For anything else, copy `.env.example`:

```env
PORT=4000
DATABASE_URL=file:./paltas.db
CORS_ORIGIN=http://localhost:5173

VITE_API_URL=https://api.your-host.com
VITE_WS_URL=wss://api.your-host.com/live
```

### Moving to PostgreSQL

Drizzle keeps the queries portable. Swap `drizzle-orm/better-sqlite3` for
`drizzle-orm/node-postgres`, change `dialect` in `drizzle.config.ts`, adjust the column helpers
in `schema.ts`, and regenerate. The route handlers and every client hook stay as they are.

---

## Design notes

**Types are the contract.** `@paltas/shared` is compiled and imported by both sides, so a
server response that drifts from what the client expects fails `npm run typecheck` rather than
at runtime in front of someone.

**JSON columns where they earn it.** Tag lists and workflow rule graphs are read and written
whole; normalising a six-item array into its own table would cost a join for nothing. Anything
queried or aggregated is a real column.

**WAL mode** is on, so readers do not block the writer — which matters the moment two tabs are
mutating at once.

**Charts are hand-rolled SVG**, not a charting library: a few hundred bytes instead of ~90KB,
and they inherit the palette from `tailwind.config.ts` automatically.

**The AI assistant** has a real transcript, typing state and an approval gate for anything
financial or irreversible. Its `resolve()` matches keywords against a canned knowledge base —
replace that one function with a call to your inference endpoint and nothing around it changes.

---

## The record store

The dashboard covers a lot of ground, and most of it is the same shape: a list of business
objects with typed fields that someone needs to read, add to, edit and export. Twenty-odd
near-identical tables would buy no extra safety and would make adding a business object a
migration. Instead there is one `records` table discriminated by `kind`, described by a
registry in `packages/shared/src/records.ts`.

The registry is the single source of truth:

- the **server** builds a Zod schema from it to validate every write,
- the **client** generates its create form from it, so the fields a user sees are the fields
  the server checks,
- **CSV export** takes its column order and headers from it, and **CSV import** matches headers
  back against it, so a file exported from a screen re-imports without editing.

Row *shapes* are generated alongside it in `record-types.ts`, and `RecordTable` is generic over
the kind name — writing `kind="business-vendor-directory"` types the column callbacks against
that row, so renaming a field is a build error in the screen that renders it, not a blank cell
at runtime.

Adding a business object is one registry entry. No migration, no new route, no new component.

---

## Verified

`npm run typecheck` and `npm run build` are clean across all three workspaces.

Two Playwright suites run against two simultaneous browser tabs, 33 assertions, zero console
errors:

- **Reactivity and flows (17)** — record tables load from the API; the generated form creates a
  row that appears immediately and reaches the other tab over the socket; CSV export downloads
  real bytes; repricing, raising a work order, switching plan, bulk approval, mark-all-read and
  the rent run all write through and are reflected in the audit trail; the audit timeline and
  its asset filter read the `activity` table; every one of the 28 sections loads with no error
  state and no empty table.
- **Documents (16)** — library, download of stored bytes, upload, cross-tab push, SHA-256
  checksum, publishing v2 while v1 stays retrievable, a signature round through to a timestamped
  signature, renewal, template generation, the expiry sweep, and persistence across reload.
