# OmniPOS

A multi-tenant commerce platform. **One shared core** powers any service business; each industry is a
**domain module** (configurable plugin) layered on top. First module: **Pet Grooming**. Next in line:
**Restaurant** (core is designed for it; module stubbed).

Built **free-tier-first, scale-ready**: the architecture matches the enterprise target (NestJS, Postgres,
Redis, WebSockets), but non-free pieces are deferred behind adapters so going to paid AWS is config, not code.

## Stack
- **Monorepo:** Turborepo + pnpm
- **Frontend:** Next.js 15 (App Router), Tailwind, bilingual EN/FR
- **Backend:** NestJS (REST + Socket.IO)
- **DB:** PostgreSQL (Neon) via Prisma, tenant isolation via Row-Level Security
- **Jobs/cache:** Redis (Upstash) + BullMQ
- **Payments:** Stripe (test) — Moneris on the paid path
- **Hosting (demo):** Vercel + Railway + Neon + Upstash

## Layout
```
apps/api      NestJS — core + loaded domain modules
apps/admin    Next.js — HQ, store manager, reception POS, call center, groomer PWA
apps/web      Next.js — franchise-branded public booking sites
packages/db             Prisma schema, migrations, RLS, seed
packages/core           generic domain primitives (tax, rounding, pricing, module contract)
packages/domain-pet     Pet Grooming module
packages/domain-restaurant  Restaurant module (stub)
packages/ui             shared React components
packages/i18n           EN/FR message catalogs
packages/config         shared tsconfig presets
```

## Prerequisites
Node 24 + pnpm. On this machine Node lives at `~/.local/node`:
```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

## Getting started
```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL etc.
pnpm db:generate
pnpm build                  # build shared packages + apps
pnpm test                   # core engine unit tests
pnpm dev                    # run api (4000) + admin (3000) + web (3001)
```
