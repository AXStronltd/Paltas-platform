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
