import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Prisma } from '@omnipos/db';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { CreatePetDto } from './dto/create-pet.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { UpdatePetDto } from './dto/update-pet.dto';

export interface ListCustomersDto {
  storeId?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
  orderBy?: 'firstName' | 'lastName' | 'createdAt';
  order?: 'asc' | 'desc';
  /** Quick filters */
  noBooking?: boolean;
  notSeenWeeks?: number;
  /** Custom filters */
  breed?: string;
  tags?: string;        // comma-separated
  membershipTier?: string;
  city?: string;
  postalCode?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cls: ClsService,
  ) {}

  // ── List with pagination, sort, filter ────────────────────────────────────

  async findAll(dto: ListCustomersDto = {}) {
    const { storeId, q, page = 1, limit = 20, orderBy = 'firstName', order = 'asc',
      noBooking, notSeenWeeks, breed, tags, membershipTier, city, postalCode } = dto;
    const status = dto.status ?? 'ACTIVE';
    const skip = (page - 1) * limit;

    // Build Prisma where clause
    const where: Prisma.CustomerWhereInput = {
      ...(status !== 'ALL' && { status: status as Prisma.EnumCustomerStatusFilter }),
    };

    // Search across name / phone / email / pet name
    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { pets: { some: { name: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    // Store scope: customers with a booking at this store OR preferredStoreId matches
    if (storeId) {
      where.AND = [
        {
          OR: [
            { preferredStoreId: storeId },
            { bookings: { some: { storeId } } },
          ],
        },
      ];
    }

    // Quick filter: never had a booking
    if (noBooking) {
      where.bookings = { none: {} };
    }

    // Quick filter: not seen in X weeks
    if (notSeenWeeks) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - notSeenWeeks * 7);
      where.bookings = { none: { scheduledStart: { gte: cutoff } } };
    }

    // Custom filters
    if (breed) where.pets = { some: { breed: { contains: breed, mode: 'insensitive' } } };
    if (membershipTier) where.membershipTier = membershipTier;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (postalCode) where.postalCode = { contains: postalCode, mode: 'insensitive' };
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length) where.tags = { hasSome: tagList };
    }

    // Sort mapping
    const orderByClause: Prisma.CustomerOrderByWithRelationInput =
      orderBy === 'firstName' ? { fullName: order } :
      orderBy === 'lastName'  ? { fullName: order } :   // fallback — no separate last name field
                                { createdAt: order };

    const [customers, total] = await Promise.all([
      this.prisma.db.customer.findMany({
        where,
        orderBy: orderByClause,
        skip,
        take: limit,
        include: {
          pets: { select: { id: true, name: true, breed: true, species: true, tags: true, preferredGroomerId: true } },
          memberships: { where: { status: 'ACTIVE' }, include: { plan: { select: { tier: true } } }, take: 1 },
          _count: { select: { bookings: true } },
        },
      }),
      this.prisma.db.customer.count({ where }),
    ]);

    // Enrich with computed fields (last appt, next appt, total sales)
    const now = new Date();
    const enriched = await Promise.all(customers.map(async c => {
      const [lastAppt, nextAppt, totalSales] = await Promise.all([
        this.prisma.db.booking.findFirst({
          where: { customerId: c.id, status: 'COMPLETED' },
          orderBy: { scheduledStart: 'desc' },
          select: { id: true, scheduledStart: true, status: true },
        }),
        this.prisma.db.booking.findFirst({
          where: { customerId: c.id, scheduledStart: { gt: now }, status: { in: ['PENDING', 'CONFIRMED'] } },
          orderBy: { scheduledStart: 'asc' },
          select: { id: true, scheduledStart: true },
        }),
        this.prisma.db.invoice.aggregate({
          where: { bookingId: { in: [] }, status: 'PAID' },
          // Note: invoice doesn't have customerId directly — sum via bookings
          _sum: { totalCents: true },
        }),
      ]);

      // Get total sales via a join through bookings
      const salesResult = await this.prisma.db.invoice.aggregate({
        where: {
          booking: { customerId: c.id },
          status: 'PAID',
        },
        _sum: { totalCents: true },
      });

      return {
        ...c,
        lastAppt: lastAppt ?? null,
        nextAppt: nextAppt ?? null,
        totalSalesCents: salesResult._sum.totalCents ?? 0,
      };
    }));

    return { data: enriched, total, page, limit };
  }

  // ── Search (legacy — kept for backward-compat, used by booking creation) ──

  async search(query: string) {
    const db = this.prisma.db;
    return db.customer.findMany({
      where: {
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { pets: true },
      take: 20,
    });
  }

  // ── Single customer ────────────────────────────────────────────────────────

  async findOne(id: string) {
    const customer = await this.prisma.db.customer.findUnique({
      where: { id },
      include: {
        pets: { include: { vaccinations: true } },
        bookings: { orderBy: { scheduledStart: 'desc' }, take: 20,
          select: { id: true, status: true, scheduledStart: true, scheduledEnd: true,
            lineItems: { select: { description: true } } } },
        memberships: { where: { status: 'ACTIVE' }, include: { plan: true }, take: 1 },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    await this.audit.log({ action: 'CUSTOMER_VIEW', entityType: 'customer', entityId: id });
    return customer;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateCustomerDto) {
    const tenantId = this.cls.get<string>('tenantId');
    const customer = await this.prisma.db.customer.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        addressLine: dto.addressLine,
        city: dto.city,
        postalCode: dto.postalCode,
        membershipTier: dto.membershipTier,
        emergencyContact: dto.emergencyContact,
        tags: dto.tags ?? [],
        status: (dto.status as 'ACTIVE' | undefined) ?? 'ACTIVE',
      },
    });
    await this.audit.log({ action: 'CUSTOMER_CREATE', entityType: 'customer', entityId: customer.id });
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.db.customer.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.addressLine !== undefined && { addressLine: dto.addressLine }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.membershipTier !== undefined && { membershipTier: dto.membershipTier }),
        ...(dto.emergencyContact !== undefined && { emergencyContact: dto.emergencyContact }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.status !== undefined && { status: dto.status as 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'LEAD' | 'DELETED' }),
      },
    });
    await this.audit.log({ action: 'CUSTOMER_UPDATE', entityType: 'customer', entityId: id });
    return customer;
  }

  /** Soft-delete: sets status to DELETED. */
  async softDelete(id: string) {
    const customer = await this.prisma.db.customer.update({
      where: { id },
      data: { status: 'DELETED' },
    });
    await this.audit.log({ action: 'CUSTOMER_DELETE', entityType: 'customer', entityId: id });
    return customer;
  }

  // ── Reliability summary ────────────────────────────────────────────────────

  async reliabilitySummary(customerId: string) {
    const db = this.prisma.db;
    const counts = await db.booking.groupBy({
      by: ['status'],
      where: { customerId, scheduledStart: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
      _count: true,
    });
    const m = Object.fromEntries(counts.map((r) => [r.status, r._count]));
    return {
      completed: m['COMPLETED'] ?? 0,
      cancelled: m['CANCELLED'] ?? 0,
      noShow: m['NO_SHOW'] ?? 0,
      late: m['LATE'] ?? 0,
    };
  }

  // ── Pets ───────────────────────────────────────────────────────────────────

  async createPet(customerId: string, dto: CreatePetDto, tenantId: string) {
    const { attributes, dateOfBirth, ...rest } = dto;
    const pet = await this.prisma.db.pet.create({
      data: {
        ...rest,
        customerId,
        tenantId,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        attributes: (attributes ?? {}) as object,
      },
    });
    await this.audit.log({ action: 'PET_CREATE', entityType: 'pet', entityId: pet.id });
    return pet;
  }

  async updatePet(petId: string, dto: UpdatePetDto) {
    const { attributes, dateOfBirth, ...rest } = dto;
    const pet = await this.prisma.db.pet.update({
      where: { id: petId },
      data: {
        ...rest,
        ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
        ...(attributes !== undefined && { attributes: attributes as object }),
      },
    });
    await this.audit.log({ action: 'PET_UPDATE', entityType: 'pet', entityId: petId });
    return pet;
  }

  async findPet(petId: string) {
    const pet = await this.prisma.db.pet.findUnique({
      where: { id: petId },
      include: {
        vaccinations: true,
        bookings: { orderBy: { scheduledStart: 'desc' }, take: 10, include: { workflow: { orderBy: { occurredAt: 'asc' } } } },
      },
    });
    if (!pet) throw new NotFoundException('Pet not found');
    return pet;
  }

  async deletePet(petId: string) {
    await this.prisma.db.pet.delete({ where: { id: petId } });
    await this.audit.log({ action: 'PET_DELETE', entityType: 'pet', entityId: petId });
  }

  // ── Statement credit ───────────────────────────────────────────────────────

  async applyStatementCredit(customerId: string, deltaCents: number) {
    return this.prisma.db.customer.update({
      where: { id: customerId },
      data: { statementCreditCents: { increment: deltaCents } },
    });
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  async savePreferences(customerId: string, prefs: {
    autoMessageMode?: string;
    blockMessages?: boolean;
    blockOnlineBooking?: boolean;
    optOutMarketingSms?: boolean;
    optOutMarketingEmail?: boolean;
    bookingFreqValue?: number;
    bookingFreqUnit?: string;
    preferredGroomerId?: string | null;
  }) {
    return this.prisma.db.customer.update({ where: { id: customerId }, data: prefs });
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(customerId: string) {
    return this.prisma.db.customerNote.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async addNote(customerId: string, body: string, authorId: string, tenantId: string) {
    return this.prisma.db.customerNote.create({
      data: { tenantId, customerId, body, authorId },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async deleteNote(noteId: string) {
    return this.prisma.db.customerNote.delete({ where: { id: noteId } });
  }

  // ── Appointment stats + filtered history ──────────────────────────────────

  async appointmentStats(customerId: string) {
    const allBookings = await this.prisma.db.booking.findMany({
      where: { customerId },
      select: { status: true },
    });
    const statusMap: Record<string, number> = {};
    for (const b of allBookings) statusMap[b.status] = (statusMap[b.status] ?? 0) + 1;

    const invoiceAgg = await this.prisma.db.invoice.aggregate({
      where: { booking: { customerId }, status: 'PAID' },
      _sum: { totalCents: true },
    });

    return {
      total: allBookings.length,
      totalSalesCents: invoiceAgg._sum.totalCents ?? 0,
      completed: statusMap['COMPLETED'] ?? 0,
      cancelled: statusMap['CANCELLED'] ?? 0,
      noShow: statusMap['NO_SHOW'] ?? 0,
      unclosed: (statusMap['CHECKED_IN'] ?? 0) + (statusMap['IN_PROGRESS'] ?? 0) + (statusMap['READY'] ?? 0),
      outstanding: (statusMap['PENDING'] ?? 0) + (statusMap['CONFIRMED'] ?? 0),
    };
  }

  async appointmentHistory(customerId: string, filter?: string) {
    const now = new Date();
    const whereBase: Prisma.BookingWhereInput = { customerId };

    if (filter === 'upcoming') {
      whereBase.scheduledStart = { gte: now };
      whereBase.status = { in: ['PENDING', 'CONFIRMED'] };
    } else if (filter === 'completed') {
      whereBase.status = 'COMPLETED';
    } else if (filter === 'cancelled') {
      whereBase.status = 'CANCELLED';
    } else if (filter === 'no_show') {
      whereBase.status = 'NO_SHOW';
    } else if (filter === 'outstanding') {
      whereBase.status = { in: ['PENDING', 'CONFIRMED'] };
    } else if (filter === 'unclosed') {
      whereBase.status = { in: ['CHECKED_IN', 'IN_PROGRESS', 'READY'] };
    }

    return this.prisma.db.booking.findMany({
      where: whereBase,
      orderBy: { scheduledStart: 'desc' },
      take: 50,
      include: {
        store: { select: { name: true } },
        pet: { select: { id: true, name: true, breed: true } },
        lineItems: { select: { description: true, unitPriceCents: true } },
        invoice: { select: { totalCents: true, status: true } },
        // assigned groomer from workflow events
        workflow: { where: { stage: 'CHECK_IN' }, select: { occurredAt: true }, take: 1 },
      },
    });
  }
}
