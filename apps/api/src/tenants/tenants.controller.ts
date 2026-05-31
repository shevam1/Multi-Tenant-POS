import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CatalogService } from '../catalog/catalog.service';
import { BookingsService } from '../bookings/bookings.service';
import type { BookingSource } from '@omnipos/db';

@Controller('public')
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly catalog: CatalogService,
    private readonly bookings: BookingsService,
  ) {}

  @Public()
  @Get('tenant/:slug')
  async getTenant(@Param('slug') slug: string) {
    const tenant = await this.prisma.asSystem(tx => tx.tenant.findUnique({
      where: { slug },
      include: { stores: true },
    }));
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  @Public()
  @Get('tenant/:slug/catalog')
  async getCatalog(
    @Param('slug') slug: string,
    @Query('storeId') storeId?: string,
    @Query('species') species?: string,
    @Query('hairLength') hairLength?: string,
    @Query('breed') breed?: string,
    @Query('weightKg') weightKg?: string,
  ) {
    const tenant = await this.prisma.asSystem(tx => tx.tenant.findUnique({ where: { slug } }));
    if (!tenant) throw new NotFoundException('Tenant not found');

    // Location-aware catalog: items available at the store, priced per location,
    // optionally filtered to services eligible for the selected pet.
    if (storeId) {
      const pet = (species || hairLength || breed || weightKg)
        ? { species, hairLength, breed, weightKg: weightKg ? Number(weightKg) : undefined }
        : undefined;
      return this.catalog.catalogForStore(tenant.id, storeId, pet);
    }

    // No store specified — return all active items at base price (backward compat).
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, TRUE)`;
      const items = await tx.catalogItem.findMany({ where: { active: true }, orderBy: { kind: 'asc' } });
      return items.map(i => ({ id: i.id, kind: i.kind, name: i.name, description: i.description, durationMin: i.durationMin, priceCents: i.basePriceCents, available: true }));
    }, { timeout: 30000 });
  }

  /** Public receipt view (bookingId is the unguessable token). */
  @Public()
  @Get('receipt/:bookingId')
  async getReceipt(@Param('bookingId') bookingId: string) {
    const invoice = await this.prisma.asSystem(tx =>
      tx.invoice.findFirst({
        where: { bookingId },
        include: {
          lines: true, taxLines: true, payments: { select: { tender: true, amountCents: true } },
          store: { select: { name: true, addressLine: true, city: true, province: true } },
          booking: { select: { scheduledStart: true, customer: { select: { fullName: true } }, pet: { select: { name: true } } } },
        },
      }),
    );
    if (!invoice) throw new NotFoundException('Receipt not found');
    return invoice;
  }

  @Public()
  @Get('tenant/:slug/availability')
  async getAvailability(@Param('slug') slug: string, @Query('storeId') storeId: string, @Query('date') date: string) {
    const tenant = await this.prisma.asSystem(tx => tx.tenant.findUnique({ where: { slug } }));
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.bookings.availability(storeId, date, tenant.id);
  }

  @Public()
  @Post('tenant/:slug/bookings')
  async createPublicBooking(
    @Param('slug') slug: string,
    @Body() body: {
      storeId: string;
      customer: { fullName: string; phone?: string; email?: string };
      pet?: { name: string; species?: string; breed?: string; weightKg?: number };
      /** Multi-pet bookings: each pet with its own selected packages. */
      pets?: { name: string; species?: string; breed?: string; weightKg?: number; catalogItemIds?: string[] }[];
      scheduledStart: string;
      catalogItemIds?: string[];
      notes?: string;
      cardOnFile?: boolean;
      isNewCustomer?: boolean;
    },
  ) {
    // Resolve tenant (cross-tenant lookup via bypass)
    const tenant = await this.prisma.asSystem(tx => tx.tenant.findUnique({ where: { slug } }));
    if (!tenant) throw new NotFoundException('Tenant not found');

    // All writes run inside a single transaction with tenant context set first
    const booking = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, TRUE)`;

      // Upsert customer by phone
      const existing = body.customer.phone
        ? await tx.customer.findFirst({ where: { phone: body.customer.phone } })
        : null;

      let customerId: string;
      if (existing) {
        customerId = existing.id;
      } else {
        const cust = await tx.customer.create({
          data: {
            tenantId: tenant.id,
            fullName: body.customer.fullName,
            phone: body.customer.phone,
            email: body.customer.email,
          },
        });
        customerId = cust.id;
      }

      // Normalise to a pets[] array (supports both single `pet` and multi `pets`).
      const petInputs = body.pets?.length
        ? body.pets
        : body.pet
          ? [{ ...body.pet, catalogItemIds: body.catalogItemIds }]
          : [];

      // Pre-load catalog (with location overrides) for price resolution.
      const allItemIds = [...new Set(petInputs.flatMap(p => p.catalogItemIds ?? []).concat(body.catalogItemIds ?? []))];
      const catalogItems = allItemIds.length
        ? await tx.catalogItem.findMany({ where: { id: { in: allItemIds } }, include: { storeOverrides: { where: { storeId: body.storeId } } } })
        : [];
      const priceOf = (id: string) => {
        const it = catalogItems.find(c => c.id === id);
        return it ? { name: it.name, price: it.storeOverrides[0]?.priceCents ?? it.basePriceCents } : null;
      };

      // Create pets
      const createdPetIds: string[] = [];
      const lineItems: { tenantId: string; catalogItemId: string; description: string; quantity: number; unitPriceCents: number }[] = [];
      for (const p of petInputs) {
        const pet = await tx.pet.create({
          data: { tenantId: tenant.id, customerId, name: p.name, species: p.species ?? 'DOG', breed: p.breed, weightKg: p.weightKg },
        });
        createdPetIds.push(pet.id);
        for (const cid of p.catalogItemIds ?? []) {
          const resolved = priceOf(cid);
          if (resolved) lineItems.push({ tenantId: tenant.id, catalogItemId: cid, description: `${resolved.name} — ${p.name}`, quantity: 1, unitPriceCents: resolved.price });
        }
      }

      const primaryPetId = createdPetIds[0];
      const extraPetIds = createdPetIds.slice(1);

      return tx.booking.create({
        data: {
          tenantId: tenant.id,
          storeId: body.storeId,
          customerId,
          petId: primaryPetId,
          status: 'PENDING',
          source: 'WEB' as BookingSource,
          scheduledStart: new Date(body.scheduledStart),
          notes: body.notes,
          cardOnFile: body.cardOnFile ?? false,
          lineItems: lineItems.length ? { create: lineItems } : undefined,
          extraPets: extraPetIds.length ? { create: extraPetIds.map(pid => ({ tenantId: tenant.id, petId: pid })) } : undefined,
        },
        include: { customer: true, pet: true, lineItems: true, extraPets: { include: { pet: true } } },
      });
    }, { timeout: 30000 });

    // Push to admin in real time
    this.realtime.emitNewBooking(tenant.id, booking);
    return booking;
  }
}
