import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { CreateVaccinationDto } from './dto/create-vaccination.dto';

/** Days-ahead thresholds for expiry warnings. */
const EXPIRY_WARN_DAYS = [30, 14, 7];

@Injectable()
export class VaccinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async listForPet(petId: string) {
    return this.prisma.db.vaccinationRecord.findMany({
      where: { petId },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async create(petId: string, dto: CreateVaccinationDto) {
    const pet = await this.prisma.db.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundException('Pet not found');

    const record = await this.prisma.db.vaccinationRecord.create({
      data: {
        tenantId: pet.tenantId,
        petId,
        vaccineType: dto.vaccineType,
        administeredAt: dto.administeredAt ? new Date(dto.administeredAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        documentUrl: dto.documentUrl,
      },
    });
    await this.audit.log({ action: 'VACCINATION_CREATE', entityType: 'vaccination_record', entityId: record.id });
    return record;
  }

  async update(id: string, dto: Partial<CreateVaccinationDto>) {
    const record = await this.prisma.db.vaccinationRecord.update({
      where: { id },
      data: {
        vaccineType: dto.vaccineType,
        administeredAt: dto.administeredAt ? new Date(dto.administeredAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        documentUrl: dto.documentUrl,
      },
    });
    await this.audit.log({ action: 'VACCINATION_UPDATE', entityType: 'vaccination_record', entityId: id });
    return record;
  }

  async remove(id: string) {
    await this.prisma.db.vaccinationRecord.delete({ where: { id } });
    await this.audit.log({ action: 'VACCINATION_DELETE', entityType: 'vaccination_record', entityId: id });
  }

  // ── Expiry helpers ────────────────────────────────────────────────────────

  /** Returns a status for a single record. */
  static expiryStatus(expiresAt: Date | null): 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_DATE' {
    if (!expiresAt) return 'NO_DATE';
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft < 0) return 'EXPIRED';
    if (daysLeft <= 30) return 'EXPIRING_SOON';
    return 'VALID';
  }

  /** True if any vaccine is expired (used by booking-block check). */
  async hasExpiredVaccinations(petId: string): Promise<boolean> {
    const records = await this.listForPet(petId);
    return records.some(r => r.expiresAt && r.expiresAt < new Date());
  }

  // ── Compliance report ─────────────────────────────────────────────────────

  /**
   * Per-spec §3: "compiles a comprehensive vaccination compliance report
   * highlighting which pets are out of date."
   */
  async complianceReport(storeId?: string, q?: string) {
    // Get all pets accessible in the current tenant scope, optionally filtered by
    // owner name or pet name (search).
    const pets = await this.prisma.db.pet.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { customer: { fullName: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : undefined,
      include: {
        vaccinations: { orderBy: { expiresAt: 'asc' } },
        customer: { select: { id: true, fullName: true, phone: true } },
      },
    });

    return pets.map(pet => {
      const statuses = pet.vaccinations.map(v => ({
        id: v.id,
        vaccineType: v.vaccineType,
        expiresAt: v.expiresAt,
        status: VaccinationsService.expiryStatus(v.expiresAt),
      }));

      const overallStatus = statuses.some(s => s.status === 'EXPIRED')
        ? 'EXPIRED'
        : statuses.some(s => s.status === 'EXPIRING_SOON')
        ? 'EXPIRING_SOON'
        : statuses.length === 0
        ? 'NO_RECORDS'
        : 'COMPLIANT';

      return {
        petId: pet.id,
        customerId: pet.customer.id,
        petName: pet.name,
        breed: pet.breed,
        ownerName: pet.customer.fullName,
        ownerPhone: pet.customer.phone,
        overallStatus,
        vaccinations: statuses,
      };
    });
  }

  /**
   * Finds all pets with vaccinations expiring within `withinDays` days.
   * Used by the daily cron alert job.
   */
  async findExpiringAcrossAllTenants(withinDays: number) {
    const cutoff = new Date(Date.now() + withinDays * 86_400_000);
    const now = new Date();

    // Use asSystem so the cron can read across tenants
    return this.prisma.asSystem(async tx => {
      return tx.vaccinationRecord.findMany({
        where: {
          expiresAt: { gt: now, lte: cutoff },
        },
        include: {
          pet: {
            include: {
              customer: { select: { fullName: true, email: true, phone: true } },
            },
          },
        },
      });
    });
  }
}
