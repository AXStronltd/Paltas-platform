# External listings — the legal position, and what the code does about it

## The short version

**Do not display scraped or aggregated third-party listings commercially without
a written licence.** Ingest them for internal market and pricing analysis if
that is useful — that is a much weaker claim and a much smaller risk — but do
not put them on the shopfront.

The code enforces this rather than trusting anyone to remember it. Nothing
reaches the public feed unless a human has recorded a licence, with a contract
reference, that explicitly grants display.

## Why

Four separate exposures, which is why "is scraping legal?" is the wrong
question. Fetching and *publishing* are different acts.

**Photographs are the real risk.** Property photography is almost always owned
by the photographer, the agent or the originating portal, and it is the thing
rights holders actually sue over. REA Group sued its rival Domain over property
photographs and floorplans; Zillow has repeatedly faced infringement claims over
scraped professional photos. A listing's *facts* — price, bedrooms, floor area —
are individually much weaker as copyright subject matter. Its *images and
description* are not.

**EU database right.** The `sui generis` database right protects substantial
investment in compiling a database for fifteen years, independently of
copyright, across the EU and UK. Extracting a substantial part of a portal's
listing database infringes it even where no individual fact is protected. An
aggregator covering 24 countries is squarely in this territory.

**Agent contact details are personal data.** Names, phone numbers and email
addresses of estate agents are personal data under GDPR. Republishing them is
processing, and needs a lawful basis; Article 14 also requires notifying people
whose data you obtained from somewhere other than themselves. Scraping an
agent's mobile number off a portal and putting it on a commercial marketplace is
the part most likely to produce a complaint to a regulator rather than a letter
from a lawyer.

**The platform's terms put this on you.** Apify's terms state that the customer
is responsible for the legality of the data they extract, and require the
customer to indemnify Apify against third-party claims. Apify's own liability is
capped at $1,000. Whatever an actor's listing page implies about coverage, the
contractual risk of publishing sits with PALTAS.

## What to use instead

In order of preference:

1. **Licensed or syndicated feeds.** MLS/IDX via the RESO Web API in the United
   States; direct agreements with portals or agent networks elsewhere. This is
   what GlobalListings.com-style providers sell, and it is the right shape — but
   the safety comes from the *contract*, not the brand. Before signing, confirm
   in writing:
   - an express right to **display** the data publicly and commercially;
   - a **sublicence for the photographs**, or an undertaking that images are
     cleared for syndication;
   - **territory and term**, and what happens to cached data when it ends;
   - an **indemnity** against third-party IP claims;
   - **data-protection terms** covering the agent contact data, naming who is
     controller and who is processor;
   - a **takedown SLA** you can actually meet.

2. **Official partner or affiliate APIs** where the operator wants the traffic
   and publishes terms that permit display.

3. **Your own hosts.** The inventory you already have is the only inventory you
   unambiguously control.

4. **Scraped aggregation — internal analysis only.** Pricing benchmarks, supply
   density, market coverage. Never the shopfront.

I am not a lawyer and this is not legal advice. Have counsel review any feed
agreement before it goes live, particularly the image and indemnity clauses.

## How the code enforces it

### Separation

External inventory lives in `ExternalSource`, `ExternalListing` and
`ExternalSyncRun`. It is **never** written into `PropertyListing`. That
boundary is what makes "did we have the right to publish this?" answerable, and
it means a licence ending cannot disturb a host's own advert.

`npm run audit:external` fails the build if external code writes to
`PropertyListing`.

### The gate

`src/lib/external/licence.ts` is pure — no database, no network, no environment
— so the rule that decides what may be published can be read in full and tested
on its own. It refuses by default. Three rights are tracked separately because
they genuinely are separate:

| Right | Covers | Absent means |
| --- | --- | --- |
| `displayRights` | the listing appearing at all | nothing is published |
| `imageRights` | photographs | images stripped from the payload |
| `contactDataRights` | agent name, phone, email | contact fields nulled |

Plus `territories` (a Spanish licence does not cover a Kenyan listing) and
`licenceExpiry` (an expired licence stops publishing immediately).

### Three redundant defences on the public feed

1. The query filters on `displayable`, a column only the gate writes.
2. The gate is **re-evaluated at read time**, so a licence that expired an hour
   ago stops publishing without waiting for a sweep.
3. `applyLicence` **strips** images and contact details from the payload when
   those rights are absent — removed, not hidden, because hidden is one CSS
   change away from published.

The audit asserts all three, and asserts that only the gate can grant display:
`displayable: false` is allowed anywhere, `displayable: true` only from a
verdict. Turning display off is always safe; turning it on is the act that
republishes someone else's work.

### Takedowns

`suppressed` outranks a valid licence and **survives re-ingestion**. A rights
holder who objects once never has to object again because an overnight sync
re-created the row. Asserted in `tests/external.e2e.mjs`.

### Who can do it

`external.licence.manage` is the permission that decides whether other people's
photographs appear on the marketplace. It is held by platform staff and owners
and is **granted to no tenant role** — a property manager cannot publish
third-party inventory.

## Operating it

```bash
# Register a source. Always created unlicensed.
POST /api/external/sources { key, name, provider }

# Record what the contract actually grants. Requires a licence reference.
PATCH /api/external/sources/:key { licenceStatus: "LICENSED", licenceRef, displayRights, ... }

# Fetch. Allowed regardless of licence — display is what the licence controls.
POST /api/external/sources/:key/sync

# What was ingested, and why each row is or is not publishable.
GET /api/external/listings?source=:key&displayable=false

# Honour a takedown. Immediate and durable.
POST /api/external/listings/:id/suppress { reason }

# The public feed. Licensed rows only, all flagged external and not bookable.
GET /api/public/external
```

Environment: `APIFY_TOKEN`, plus `APIFY_TRUEFETCH_DATASET_ID` or
`APIFY_TRUEFETCH_ACTOR_ID`. Absent, syncs fail cleanly and nothing publishes.

## Verification

```
npm run audit:external    10 structural checks
npm run test:auth         includes 19 licence-gate and normaliser tests
npm run test:external     45 end-to-end checks against a real database
```
