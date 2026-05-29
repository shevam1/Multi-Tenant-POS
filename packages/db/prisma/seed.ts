import bcrypt from 'bcryptjs';
import petGroomingModule from '@omnipos/domain-pet';
import { Prisma, PrismaClient } from '../src/index';

/**
 * Seeds a demo franchise for the vertical slice:
 *   - Tenant "pawsome" (pet grooming) with two stores and a user per role,
 *     a catalog built from the Pet Grooming module templates, pricing rules,
 *     customers + pets + vaccinations, and inventory.
 *   - A second tenant "barkbuddies" with its own private customer, used to
 *     prove RLS isolation.
 *
 * All writes run inside one transaction with `app.bypass_rls` enabled so the
 * seed (a trusted script) can populate across tenants. The app never does this.
 */

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Password123!';

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Idempotent reset (cascades to all child rows).
      await tx.tenant.deleteMany({ where: { slug: { in: ['pawsome', 'barkbuddies'] } } });

      // ---- Tenant 1: Pawsome (pet grooming) ----
      const pawsome = await tx.tenant.create({
        data: {
          name: 'Pawsome Grooming Co.',
          slug: 'pawsome',
          industry: 'PET_GROOMING',
          theme: { primaryColor: '#db2777', logoText: 'Pawsome' },
        },
      });

      const toronto = await tx.store.create({
        data: {
          tenantId: pawsome.id,
          name: 'Pawsome — Toronto Downtown',
          province: 'ON',
          city: 'Toronto',
          postalCode: 'M5V 2T6',
        },
      });
      const vancouver = await tx.store.create({
        data: {
          tenantId: pawsome.id,
          name: 'Pawsome — Vancouver',
          province: 'BC',
          city: 'Vancouver',
          postalCode: 'V6B 1A1',
          timezone: 'America/Vancouver',
        },
      });

      await tx.user.createMany({
        data: [
          { tenantId: pawsome.id, email: 'admin@pawsome.test', fullName: 'Aisha HQ Admin', role: 'FRANCHISE_HQ_ADMIN', passwordHash },
          { tenantId: pawsome.id, storeId: toronto.id, email: 'manager@pawsome.test', fullName: 'Marco Manager', role: 'STORE_MANAGER', passwordHash },
          { tenantId: pawsome.id, storeId: toronto.id, email: 'reception@pawsome.test', fullName: 'Rita Reception', role: 'RECEPTION', passwordHash },
          { tenantId: pawsome.id, storeId: toronto.id, email: 'groomer@pawsome.test', fullName: 'Gabe Groomer', role: 'GROOMER', passwordHash },
          { tenantId: pawsome.id, email: 'agent@pawsome.test', fullName: 'Cory Call-Center', role: 'CALL_CENTER_AGENT', passwordHash },
        ],
      });

      // Catalog from the domain module templates.
      for (const t of petGroomingModule.catalogTemplates) {
        await tx.catalogItem.create({
          data: {
            tenantId: pawsome.id,
            kind: t.kind,
            name: t.name,
            description: t.description,
            basePriceCents: t.basePriceCents,
            durationMin: t.durationMin,
            attributes: (t.attributes ?? {}) as Prisma.InputJsonValue,
          },
        });
      }

      // Pricing rules from the domain module.
      for (const r of petGroomingModule.pricingRules) {
        await tx.pricingRule.create({
          data: {
            tenantId: pawsome.id,
            type: r.type,
            match: r.match as Prisma.InputJsonValue,
            adjustment: r.adjustment,
            value: r.value,
          },
        });
      }

      // Customers + pets.
      const jane = await tx.customer.create({
        data: {
          tenantId: pawsome.id,
          fullName: 'Jane Doe',
          phone: '+14165550100',
          email: 'jane@example.com',
          city: 'Toronto',
          postalCode: 'M5V 1A1',
          membershipTier: 'GOLD',
          tags: ['VIP'],
          statementCreditCents: 2000,
          emergencyContact: 'John Doe +14165550199',
        },
      });
      await tx.pet.create({
        data: {
          tenantId: pawsome.id,
          customerId: jane.id,
          name: 'Rex',
          species: 'DOG',
          breed: 'Labrador Retriever',
          gender: 'M',
          weightKg: 32,
          tags: ['Aggressive around paws'],
          attributes: { sizeClass: 'LARGE' },
          vaccinations: {
            create: [
              {
                tenantId: pawsome.id,
                vaccineType: 'Rabies',
                administeredAt: new Date('2025-06-01'),
                expiresAt: new Date('2026-06-01'),
              },
            ],
          },
        },
      });

      const john = await tx.customer.create({
        data: {
          tenantId: pawsome.id,
          fullName: 'John Smith',
          phone: '+14165550111',
          email: 'john@example.com',
          tags: ['Cash Only'],
        },
      });
      await tx.pet.create({
        data: {
          tenantId: pawsome.id,
          customerId: john.id,
          name: 'Whiskers',
          species: 'CAT',
          breed: 'Domestic Shorthair',
          weightKg: 5,
          attributes: { sizeClass: 'SMALL' },
        },
      });

      await tx.inventoryItem.createMany({
        data: [
          { tenantId: pawsome.id, storeId: toronto.id, sku: 'SKU-882', name: 'Medicated Shampoo', category: 'RETAIL', quantity: 40, reorderLevel: 10 },
          { tenantId: pawsome.id, storeId: toronto.id, name: 'Bulk Shampoo (L)', category: 'CONSUMABLE', quantity: 25, unit: 'L', reorderLevel: 5, consumptionPerService: 0.15 },
        ],
      });

      // ---- Tenant 2: BarkBuddies (isolation test) ----
      const bark = await tx.tenant.create({
        data: { name: 'BarkBuddies Spa', slug: 'barkbuddies', industry: 'PET_GROOMING' },
      });
      await tx.store.create({
        data: { tenantId: bark.id, name: 'BarkBuddies — Calgary', province: 'AB', city: 'Calgary' },
      });
      await tx.user.create({
        data: { tenantId: bark.id, email: 'admin@barkbuddies.test', fullName: 'Bianca Admin', role: 'FRANCHISE_HQ_ADMIN', passwordHash },
      });
      await tx.customer.create({
        data: { tenantId: bark.id, fullName: 'Secret Client', phone: '+14035550000', email: 'secret@barkbuddies.test' },
      });

      console.log(`Seeded:
  - pawsome     (2 stores, 5 users, ${petGroomingModule.catalogTemplates.length} catalog items, 2 customers)
  - barkbuddies (1 store, 1 user, 1 private customer)
  Demo password for all users: ${DEMO_PASSWORD}`);
    },
    { timeout: 30000 },
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
