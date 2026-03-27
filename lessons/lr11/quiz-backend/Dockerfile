FROM docker.io/oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bunx prisma generate

FROM docker.io/oven/bun:1-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

RUN addgroup --system --gid 1001 appgroup \
 && adduser  --system --uid 1001 --ingroup appgroup appuser

COPY --from=builder --chown=appuser:appgroup /app/node_modules  ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/src           ./src
COPY --from=builder --chown=appuser:appgroup /app/prisma        ./prisma
COPY --from=builder --chown=appuser:appgroup /app/prisma.config.ts ./
COPY --from=builder --chown=appuser:appgroup /app/tsconfig.json ./
COPY --from=builder --chown=appuser:appgroup /app/package.json  ./

RUN mkdir -p /app/data && chown appuser:appgroup /app/data

USER appuser

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -sf http://localhost:3000/health | grep -q ok || exit 1

CMD ["sh", "-c", "bunx prisma migrate deploy && bun src/index.ts"]
