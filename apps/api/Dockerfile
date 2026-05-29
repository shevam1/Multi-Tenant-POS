# Multi-stage build for the OmniPOS API (NestJS) from the pnpm monorepo root.
# Build context must be the repo root: `docker build -f apps/api/Dockerfile .`
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- deps ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM deps AS build
RUN pnpm --filter @omnipos/db generate \
 && pnpm --filter @omnipos/core build \
 && pnpm --filter @omnipos/db build \
 && pnpm --filter @omnipos/domain-pet build \
 && pnpm --filter @omnipos/domain-restaurant build \
 && pnpm --filter @omnipos/api build

# ---- runtime ----
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
