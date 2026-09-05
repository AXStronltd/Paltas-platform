# Deploying PALTAS to Render

`render.yaml` describes both services, so the deployment lives in the repository
rather than in a dashboard whose state nobody can see.

## Once, to create everything

1. **Render → New → Blueprint**, point it at this repository.
2. Render reads `render.yaml` and creates:
   - `paltas-db` — Postgres 16
   - `paltas` — the Next.js web service, with `DATABASE_URL` already wired to it
3. It will **prompt for the secrets**, because they are marked `sync: false` and
   are deliberately not in the file:

   | Variable | Where it comes from |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
   | `STRIPE_WEBHOOK_SECRET` | filled in at step 5 below |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe, the `pk_` one |
   | `SEED_PASSWORD` | your choice — see the warning below |

4. Deploy. The build runs `prisma migrate deploy`, which applies the baseline
   migration in `prisma/migrations/` — reviewed SQL, not a schema inferred at
   deploy time.

5. **Stripe → Developers → Webhooks → Add endpoint**

   ```
   https://<your-service>.onrender.com/api/payments/webhook
   ```

   Events: `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.processing`, `charge.refunded`, `account.updated`

   Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy. Until it is
   set, the endpoint rejects every delivery — which is the correct default.

## How this deploys

Render builds the `Dockerfile` itself. No registry, no image to publish, no
package visibility to configure — those were removed because they blocked more
deploys than they solved.

The same Dockerfile is built and fully exercised in CI on every push:
`.github/workflows/image.yml` runs the resulting container against a real
Postgres and passes every e2e suite against it. So what Render builds is an
artifact already proven to start, apply migrations on boot, and serve.

### The tests gate the deploy

`autoDeploy: false` in `render.yaml`. Render does not build on push; the
`deploy` job in `.github/workflows/image.yml` calls a deploy hook once the
container test has passed **and** the CI workflow has succeeded on the same
commit. It then polls `/api/version` until paltas.io is genuinely serving that
commit, because triggering a deploy and completing one are different things.

This was not always so. Both workflows used to run *alongside* the deploy rather
than before it, so a red tick arrived after the broken code was already live —
which is how CI once failed silently for ten commits while the site deployed
regardless. The checks were real; they simply could not stop anything.

One secret makes it work: `RENDER_DEPLOY_HOOK_URL`, from Render → the service →
Settings → Deploy Hook, added under GitHub → Settings → Secrets and variables →
Actions. Without it the deploy job fails loudly and says so, rather than going
green while nothing ships.

### Both halves must share a region

```yaml
services:  [{ name: paltas-platform, region: frankfurt }]
databases: [{ name: paltas-db,       region: frankfurt }]
```

Render's internal connection string **only resolves within one region**. A
service in Frankfurt cannot reach a database in Oregon, and the failure is
`P1001: Can't reach database server at dpg-…:5432`.

Omitting a database's region does not inherit the service's — it silently takes
Render's default, which is Oregon. That is how the two ended up apart, and it is
why both are now stated explicitly.

Frankfurt because the users are in Nairobi, Stockholm and Vilnius: roughly
130 ms, 25 ms and 35 ms respectively, against roughly 280 ms, 155 ms and 165 ms
from Oregon. For East Africa the cables run north to Europe regardless, so
Oregon pays that leg and then crosses the Atlantic as well.

### Migrations

The image `CMD` runs `prisma migrate deploy` before starting the server, so the
schema is applied on boot, inside the network where the database is reachable.
Nothing touches the database at build time — which is what caused the original
`P1001`.

### If the build runs out of memory

`next build` peaks around 650 MB locally. Render's build machines are
provisioned separately from the instance, so the 512 MB instance limit does not
necessarily apply — and Render has never actually reported an out-of-memory
build here. If one does occur, the options are a larger instance, or publishing
a prebuilt image from CI and setting `runtime: image` with
`image.url: ghcr.io/axstronltd/paltas-platform:latest`. The workflow that
publishes it is already in the repository and green.

## If the build fails

Two things went wrong the first time, and both are fixed in `render.yaml` — but
they are worth knowing, because the error messages point elsewhere.

### `Environment variable not found: DATABASE_URL`

Migrations used to run in `buildCommand`. Render's build step has no reliable
connection to the database: `DATABASE_URL` may be injected, but the build is not
yet on the network the database sits on, so `prisma migrate deploy` fails and
takes the whole build with it — even though the database itself deployed fine.

Migrations now run in `startCommand`, where the service is on the network.
`migrate deploy` only applies what is pending, so running it on every boot is
safe. On a paid instance, `preDeployCommand` is tidier; it is not on the free plan.

### `JavaScript heap out of memory`

Measured on this codebase:

| | Peak resident memory |
| --- | --- |
| default build | **~650 MB** |
| with `--max-old-space-size=400` | **fails** — heap exhausted after compiling |

Render's free instance type has **512 MB**. That is not enough to build this, and
no amount of configuration changes it — `output: standalone`, single-worker
builds and dropping static generation were all tried and none brought it under.

`NODE_OPTIONS=--max-old-space-size=1536` is set, which helps on an instance that
*has* the memory. If the build still dies with a heap error, the instance is too
small and the options are:

1. **Move to a plan with at least 1 GB** — the direct fix.
2. **Build elsewhere and deploy an image.** CI already builds this on GitHub
   Actions, which has far more memory; switching Render to a Docker deploy of a
   prebuilt image sidesteps the constraint entirely and keeps the free runtime.

The runtime itself is comfortable in 512 MB. It is only the build that is not.

## Seeding

The seed creates demo accounts with a **known password**. On a public host that
is an open door, so either set `SEED_PASSWORD` to something private, or do not
seed at all and create the first owner yourself.

From the Render shell:

```bash
npm run db:seed
```

## Health check

`render.yaml` points the health check at `/api/public/listings`. It is public, it
touches the database, and it returns an empty array rather than an error when
there is no data — so it proves the service is actually up rather than merely
answering.

## What is not automated

- **The free Postgres plan expires.** Render's free database is deleted after 30
  days. Move to a paid plan before anything real depends on it.
- **The free web service sleeps.** First request after idle takes a few seconds.
  Stripe webhooks retry, so deliveries survive it, but it is not a production
  posture.
- **Region.** Set to `frankfurt`. Change it in `render.yaml` if your users are
  elsewhere — latency to East Africa is better from Frankfurt than from Oregon.

## After deploying

The static marketplace at `AXStronltd/paltas-smart-living` can then call:

```
GET https://<your-service>.onrender.com/api/public/listings
GET https://<your-service>.onrender.com/api/public/offers
```

Both are public projections built for exactly this — published listings and live
campaigns, with no tenant identifiers, internal ids or drafts. That is how the
existing live frontend and this platform join up, without either replacing the
other.

## Proving the money path

The payout ledger is covered by unit tests, but the Stripe calls themselves —
creating a transfer, reversing one — are not exercised by anything that runs in
CI. `npm run stripe:roundtrip` closes that gap by driving the whole path once
against Stripe **test mode**: a guest pays, the host is owed, the hold elapses,
the transfer goes out, the guest is refunded, and the transfer is reversed. It
reads the ledger out of the database between each step and sends properly signed
webhooks, so the real handler runs including its signature check.

It refuses to start against a live key. That is not a warning it prints — it
exits, because a script that creates accounts, moves money and issues refunds
must not be one mistyped variable away from doing it for real.

```
STRIPE_SECRET_KEY=sk_test_…      # test only; a live key is refused
STRIPE_WEBHOOK_SECRET=whsec_…    # the one the running app is using
PAYOUT_RUN_TOKEN=…               # the one the running app is using
DATABASE_URL=…                   # the one the running app is using
PALTAS_URL=http://localhost:3010

npm run stripe:roundtrip
```

Two things worth knowing before reading a failure as a bug.

It pays with `pm_card_bypassPending`, Stripe's test payment method whose funds
land in the available balance immediately. An ordinary test card settles to
*pending*, and the transfer then fails for insufficient funds — which looks like
a defect in the payout code and is not.

It points the first approved organisation at a throwaway connected account for
the duration of the run and puts the original value back afterwards, so it
should be run against a development database rather than one anybody depends on.

## Payout settings

| Variable | What it does |
| --- | --- |
| `PAYOUT_HOLD_DAYS` | Days after check-out before a host's money may be sent. The hold is the guest's protection: it is what gives them somewhere to complain from if the property is not as advertised. |
| `PAYOUT_MINIMUM` | Below this an earning waits for company, because a transfer costs more than it is worth. |
| `PAYOUT_RUN_TOKEN` | What the cron presents instead of a session. Generated by Render. Under 32 characters the endpoint disables the token path entirely, so a half-configured deployment pays nobody rather than anybody who asks. |

The `paltas-payouts` cron in `render.yaml` runs at 06:00 UTC — after the night's
check-outs, and early enough that a failure is read by a person during the
working day rather than at 3am.
