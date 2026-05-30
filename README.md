# OmniPOS

A **multi-tenant commerce platform** where one shared backend core powers any service business and each
industry is a **domain module** (configurable plugin) layered on top.

- **First module built:** Pet Grooming (full — booking, POS, groomer PWA, CA tax, RLS)  
- **Next in line:** Restaurant (core is designed for it; module stubbed and registered)  
- **Canada-localised:** GST/HST/PST/QST matrix, $0.05 cash rounding, CASL, bilingual EN/FR

**Free-tier-first, scale-ready:** Architecture matches the enterprise target (NestJS, Postgres, Redis,
WebSockets), but non-free pieces are deferred behind adapters — going to paid AWS is config, not code.

---

## Stack

| Layer | Choice (demo) | Scale-ready path |
|---|---|---|
| Monorepo | Turborepo + pnpm | same |
| Frontend | Next.js 15, Tailwind, shadcn/ui | same |
| Backend | NestJS (REST + Socket.IO) | + ECS/EKS |
| DB | Postgres (Neon free) + Prisma | RDS/Aurora |
| Tenancy | Postgres Row-Level Security (FORCE) | same |
| Cache/jobs | Upstash Redis + BullMQ | ElastiCache + Kafka |
| Payments | Stripe test (SetupIntent, links) | + Moneris card-present |
| Messaging | Console adapter (CASL logs kept) | Twilio + SendGrid |
| Hosting | Vercel + Railway/Render | AWS containers |

---

## Monorepo layout

```
apps/
  api/      NestJS — core + loaded domain modules
  admin/    Next.js — HQ portal, store manager, reception POS, groomer PWA
  web/      Next.js — franchise-branded public booking sites

packages/
  db/                  Prisma schema, migrations, RLS policies, seed
  core/                Canadian tax engine, pricing engine, DomainModule contract
  domain-pet/          Pet Grooming module (9 stages, 8 catalog items, 3 consent forms)
  domain-restaurant/   Restaurant module (stub — validates plugin interface)
  ui/                  Shared React components
  i18n/                EN/FR message catalogs
  config/              Shared tsconfig presets
```

---

## Prerequisites

Node 24 + pnpm. On this machine Node lives at `~/.local/node`:
```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

---

## Getting started

### 1. Install + configure
```bash
pnpm install
cp .env.example .env
# Fill in DATABASE_URL (omnipos_app role) and DIRECT_URL (neondb_owner)
# See .env.example for the required Neon DB setup
```

### 2. Database setup (Neon or local Postgres)
```bash
# Push schema + apply RLS policies
pnpm db:push          # = prisma db push

# Create the app role (run once against the DB as owner):
# CREATE ROLE omnipos_app WITH LOGIN PASSWORD '...' NOCREATEDB NOCREATEROLE NOBYPASSRLS;
# GRANT CONNECT ON DATABASE neondb TO omnipos_app;
# GRANT USAGE ON SCHEMA public TO omnipos_app;
# GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO omnipos_app;
# GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO omnipos_app;
# ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO omnipos_app;
# ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO omnipos_app;

# Seed demo data (2 tenants, 5 users, 8 catalog items)
pnpm db:seed
```

### 3. Build + test
```bash
pnpm build            # builds all 7 packages/apps
pnpm test             # core engine unit tests (CA tax, rounding, pricing)
```

### 4. Dev
```bash
pnpm dev              # turbo: api:4000 + admin:3000 + web:3001
```

---

## Demo walkthrough

### Franchise booking site → admin (M3)
1. Open **http://localhost:3001/book?tenant=pawsome**
2. Click **New customer** → fill in name + phone → add pet → select service → pick time → confirm
3. Booking lands in admin as **Pending**
4. Open **http://localhost:3000** → login as `manager@pawsome.test / Password123!`
5. Dashboard shows the pending booking **in real time (no refresh)** via Socket.IO
6. Click **Approve** → status becomes Confirmed

### Reception POS + groomer PWA (M2)
1. Login as `reception@pawsome.test / Password123!` at http://localhost:3000
2. Approve a pending booking → it appears in the **Live Queue Board**
3. Open **/groomer** (mobile-optimised, dark theme) as `groomer@pawsome.test`
4. Tap through the 9 workflow stages (Check-in → Bath → … → Ready) — timestamps persist
5. **Contact masking:** switch to groomer login → `GET /api/customers` returns phone=null, email=null

### POS Checkout — Canadian tax compliance
1. From booking detail, click **POS Checkout**
2. Select service lines, choose tender (CASH / CARD / Mobile)
3. Preview shows:
   - **Ontario HST 13%** auto-calculated
   - **$0.05 cash rounding** for CASH tender (penny elimination)
   - Statement credit deduction (if any on the customer account)
4. Pay → Invoice created, booking marked COMPLETED

### RLS tenant isolation
```bash
# Two tenants in seed: pawsome (3 stores) and barkbuddies (1 store)
# Login as barkbuddies admin → GET /api/customers returns only barkbuddies' Secret Client
# Pawsome's customers are completely invisible at DB level (Postgres RLS USING clause)
```

### Canadian tax matrix (core engine test)
```bash
pnpm test     # 14 unit tests across 13 provinces / territories
# BC GST 5% + PST 7%, QC GST 5% + QST 9.975%, AB GST 5%, ON HST 13%, etc.
```

---

## Demo seed credentials

All passwords: `Password123!`

| Tenant | Email | Role |
|---|---|---|
| pawsome | admin@pawsome.test | FRANCHISE_HQ_ADMIN |
| pawsome | manager@pawsome.test | STORE_MANAGER (Toronto) |
| pawsome | reception@pawsome.test | RECEPTION (Toronto) |
| pawsome | groomer@pawsome.test | GROOMER (Toronto) |
| pawsome | callcenter@pawsome.test | CALL_CENTER_AGENT |
| barkbuddies | admin@barkbuddies.test | FRANCHISE_HQ_ADMIN |

---

## Architecture highlights

### Postgres RLS (tenant isolation)
Every tenant-scoped table has `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.
The RLS policy:
```sql
USING  ("tenantId" = current_setting('app.current_tenant', TRUE) OR current_setting('app.bypass_rls', TRUE) = 'on')
WITH CHECK ("tenantId" = current_setting('app.current_tenant', TRUE) OR current_setting('app.bypass_rls', TRUE) = 'on')
```
The app role (`omnipos_app`) has `NOBYPASSRLS`. Every query from the tenant-scoped Prisma client is sent as a batch transaction:
```sql
BEGIN;
SELECT set_config('app.current_tenant', '<tenantId>', TRUE);  -- transaction-local GUC
<model query>;     -- same connection → RLS sees the GUC
COMMIT;
```

### DomainModule contract + plugin registry
```typescript
// packages/core/src/module/domain-module.contract.ts
interface DomainModule {
  id: IndustryId;
  labels: { subject: string; staff: string; booking: string; board: string };
  workflowStages: WorkflowStageDefinition[];
  catalogTemplates: CatalogTemplate[];
  pricingRules: PricingRule[];
  consentForms: ConsentFormDefinition[];
}
```
Adding Restaurant = implement `DomainModule`, register it in `ModuleRegistryModule`. No core change.

---

## Scaling to production (post-demo checklist)
- [ ] Move `DATABASE_URL` from Neon free → RDS/Aurora + PgBouncer  
- [ ] Enable Twilio + SendGrid adapters (env vars already wired)  
- [ ] Add Moneris adapter for card-present payments  
- [ ] Containerise API (`Dockerfile` already present) → ECS/Fargate  
- [ ] Replace BullMQ with managed Kafka (MSK) for event streaming  
- [ ] Flip `STRIPE_SECRET_KEY` from test → live
