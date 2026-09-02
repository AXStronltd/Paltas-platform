# Build the application somewhere with enough memory, ship only the result.
#
# `next build` on this codebase peaks around 620–650 MB — measured — which does
# not fit a 512 MB instance. Rather than pay for a bigger machine to run a build
# that happens once per commit, the build runs in CI (which has gigabytes) and
# the host receives a finished image. The runtime is comfortable in 512 MB.

# ---- deps --------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
# Only the manifests, so this layer is cached until dependencies actually change.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build -------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No DATABASE_URL here on purpose: the build must not need a database, which is
# the mistake that caused P1001 the first time round.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# ---- runtime -----------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Run as a non-root user. The standalone server needs nothing writable.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# The standalone output carries its own minimal node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations run at start, so the CLI, the schema and the migration files must
# be present in the runtime image — standalone does not include them.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

USER nextjs
EXPOSE 10000
ENV PORT=10000
ENV HOSTNAME=0.0.0.0

# Apply pending migrations, then serve. `migrate deploy` is idempotent, so this
# is safe on every boot and on every replica.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node server.js"]
