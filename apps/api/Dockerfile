# Nibras API: NestJS modular monolith on one port (REST + Socket.IO + BullMQ workers).
# Build context: the repository root (npm workspaces monorepo).
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci -w @helpo/shared -w @helpo/api --include-workspace-root --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @helpo/shared && npm run build -w @helpo/api && mkdir -p apps/api/node_modules

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
# src + tsconfig are only for the one-off demo seed (run with tsx); the server runs dist/.
COPY --from=build /app/apps/api/src apps/api/src
COPY --from=build /app/apps/api/tsconfig.json apps/api/tsconfig.json
WORKDIR /app/apps/api
USER node
EXPOSE 3001
# Apply pending migrations, then start the single HTTP server (PORT is set by Railway).
# SEED_ON_START=true runs the idempotent demo seed after migrating; a seed failure never blocks the server.
CMD ["sh", "-c", "npx prisma migrate deploy && { if [ \"$SEED_ON_START\" = \"true\" ]; then npx tsx prisma/seed.ts || echo 'seed failed'; fi; } && node dist/main.js"]
