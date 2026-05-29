import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { CreatePetDto } from './dto/create-pet.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cls: ClsService,
  ) {}

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

  async findAll() {
    return this.prisma.db.customer.findMany({
      include: { pets: { include: { vaccinations: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.db.customer.findUnique({
      where: { id },
      include: {
        pets: { include: { vaccinations: true } },
        bookings: { orderBy: { scheduledStart: 'desc' }, take: 10 },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    await this.audit.log({ action: 'CUSTOMER_VIEW', entityType: 'customer', entityId: id });
    return customer;
  }

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
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.membershipTier !== undefined && { membershipTier: dto.membershipTier }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
    });
    await this.audit.log({ action: 'CUSTOMER_UPDATE', entityType: 'customer', entityId: id });
    return customer;
  }

  /** Reliability summary surfaced at booking time (spec: booking engine section 5). */
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

  // ---- Pets ----
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

  /** Add / update a statement credit on a customer's account. */
  async applyStatementCredit(customerId: string, deltaCents: number) {
    return this.prisma.db.customer.update({
      where: { id: customerId },
      data: { statementCreditCents: { increment: deltaCents } },
    });
  }
}
