# Build the application somewhere with enough memory, ship only the result.
#
# `next build` on this codebase peaks around 620–650 MB — measured — which does
# not fit a 512 MB instance. So the build runs in CI, which has gigabytes, and
# the host receives a finished image. The runtime is comfortable in 512 MB.
#
# Debian slim rather than Alpine, deliberately. Prisma ships different query
# engines for glibc and musl and needs OpenSSL present to pick one; on Alpine
# that goes wrong in ways that only appear at runtime, with errors like
# "Unable to require libquery_engine". The image is larger and the class of
# problem disappears.

# ---- deps --------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
# Prisma's postinstall needs OpenSSL to select an engine.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# Only the manifests, so this layer stays cached until dependencies change.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build -------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No DATABASE_URL here on purpose: the build must not need a database. Needing
# one at build time is what produced P1001 in the first place.
ENV NEXT_TELEMETRY_DISABLED=1
# `next build` peaks around 650 MB here. Capping the heap explicitly stops V8
# growing to fill whatever the daemon reports and colliding with the container
# limit. Set in the builder stage because a Render env var would only reach the
# runtime container, not the image build.
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npx prisma generate && npm run build

# ---- runtime -----------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 1001 nodejs \
    && useradd -u 1001 -g nodejs -m nextjs

# The standalone output carries its own minimal node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations run at start, so the schema, the migration files, the CLI and the
# generated client must all be in the runtime image — standalone omits them.
#
# The whole prisma and @prisma trees are copied rather than the .bin symlink:
# copying a symlink without its target is how the entrypoint ends up "not
# found". The CMD invokes the CLI's entry file directly for the same reason.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# The seed reads the system role definitions from src/. Without this the
# first-boot seed dies on a missing file and the site comes up with no accounts
# anyone can sign in with — which looks like a successful deploy.
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/security/system-roles.json ./src/lib/security/system-roles.json
# The payout cron runs from this same image and calls one endpoint over HTTP,
# so it needs the script but none of the application's own modules.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 10000
ENV PORT=10000
ENV HOSTNAME=0.0.0.0

# Migrate, seed an empty database, then serve.
#
# The migration is fatal and the seed is not, which is the distinction the old
# `;` lost. It ran the server whatever happened, so a failed migration produced
# a container that started happily, passed its health check — /api/public/
# listings needs no new column to answer — and served a build whose code was
# newer than its schema. The failure then surfaced days later as a 500 from
# whichever endpoint touched the missing column, with nothing to connect it to
# the deploy that caused it. That is precisely how a banner committed into a
# migration file went unnoticed through three deploys.
#
# Failing to start is the better outcome. Render keeps the previous container
# serving until a new one passes its health check, so a refused boot is a
# visible failed deploy rather than downtime, and the site stays on the last
# version whose schema actually matched it.
#
# first-boot.mjs stays non-fatal on purpose. It counts users and does nothing
# unless there are none, so it cannot overwrite real data however often it runs
# — and a seeding convenience should never be the reason a healthy build
# refuses to serve.
#
# `exec` so that node replaces the shell and becomes PID 1: without it SIGTERM
# reaches sh, which does not pass it on, and every shutdown is a ten-second
# wait for the kill that follows.
CMD ["sh", "-c", "node prisma/boot-migrate.mjs && { node prisma/first-boot.mjs || echo '[boot] seed step failed; continuing'; } && exec node server.js"]
