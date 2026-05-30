import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { BookingSource } from '@omnipos/db';

@Controller('public')
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
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
  async getCatalog(@Param('slug') slug: string) {
    const tenant = await this.prisma.asSystem(tx => tx.tenant.findUnique({ where: { slug } }));
    if (!tenant) throw new NotFoundException('Tenant not found');
    // Use explicit transaction with tenant context so RLS applies
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant.id}, TRUE)`;
      return tx.catalogItem.findMany({ where: { active: true }, orderBy: { kind: 'asc' } });
    }, { timeout: 30000 });
  }

  @Public()
  @Post('tenant/:slug/bookings')
  async createPublicBooking(
    @Param('slug') slug: string,
    @Body() body: {
      storeId: string;
      customer: { fullName: string; phone?: string; email?: string };
      pet?: { name: string; species?: string; breed?: string; weightKg?: number };
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

      // Create pet if provided
      let petId: string | undefined;
      if (body.pet) {
        const pet = await tx.pet.create({
          data: {
            tenantId: tenant.id,
            customerId,
            name: body.pet.name,
            species: body.pet.species ?? 'DOG',
            breed: body.pet.breed,
            weightKg: body.pet.weightKg,
          },
        });
        petId = pet.id;
      }

      // Resolve line items from catalog
      const lineItems: { tenantId: string; catalogItemId: string; description: string; quantity: number; unitPriceCents: number }[] = [];
      if (body.catalogItemIds?.length) {
        const items = await tx.catalogItem.findMany({ where: { id: { in: body.catalogItemIds } } });
        for (const item of items) {
          lineItems.push({ tenantId: tenant.id, catalogItemId: item.id, description: item.name, quantity: 1, unitPriceCents: item.basePriceCents });
        }
      }

      return tx.booking.create({
        data: {
          tenantId: tenant.id,
          storeId: body.storeId,
          customerId,
          petId,
          status: 'PENDING',
          source: 'WEB' as BookingSource,
          scheduledStart: new Date(body.scheduledStart),
          notes: body.notes,
          cardOnFile: body.cardOnFile ?? false,
          lineItems: lineItems.length ? { create: lineItems } : undefined,
        },
        include: { customer: true, pet: true, lineItems: true },
      });
    }, { timeout: 30000 });

    // Push to admin in real time
    this.realtime.emitNewBooking(tenant.id, booking);
    return booking;
  }
}
