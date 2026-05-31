import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export const PET_OPTION_CATEGORIES = [
  'PET_TYPE', 'BREED', 'BEHAVIOR', 'HAIR', 'WEIGHT', 'FIXED', 'VACCINE', 'COAT_COLOR', 'PET_TAG',
] as const;
export type PetOptionCategory = (typeof PET_OPTION_CATEGORIES)[number];

/** Baseline catalog (spec §9) — seeded once per tenant on first access. */
const SEED: { category: PetOptionCategory; label: string; min?: number; max?: number; required?: boolean }[] = [
  { category: 'PET_TYPE', label: 'Dog' },
  { category: 'PET_TYPE', label: 'Cat' },
  { category: 'BEHAVIOR', label: 'Friendly' },
  { category: 'BEHAVIOR', label: 'Noisy' },
  { category: 'BEHAVIOR', label: 'Biter' },
  { category: 'BEHAVIOR', label: 'Aggressive' },
  { category: 'BEHAVIOR', label: 'Anxious' },
  { category: 'HAIR', label: 'Long coat' },
  { category: 'HAIR', label: 'Short coat' },
  { category: 'HAIR', label: 'Wired coat' },
  { category: 'HAIR', label: 'Double Coated' },
  { category: 'WEIGHT', label: 'X-Small', min: 0, max: 10 },
  { category: 'WEIGHT', label: 'Puppy', min: 0, max: 15 },
  { category: 'WEIGHT', label: 'Small', min: 11, max: 25 },
  { category: 'WEIGHT', label: 'Medium', min: 26, max: 50 },
  { category: 'WEIGHT', label: 'Large', min: 51, max: 80 },
  { category: 'WEIGHT', label: 'X-Large', min: 81, max: 100 },
  { category: 'WEIGHT', label: 'XX-Large', min: 101, max: 120 },
  { category: 'WEIGHT', label: 'XXX-Large', min: 121, max: 99999 },
  { category: 'FIXED', label: 'Spayed (female)' },
  { category: 'FIXED', label: 'Neutered (male)' },
  { category: 'FIXED', label: 'Intact' },
  { category: 'VACCINE', label: 'Distemper', required: true },
  { category: 'VACCINE', label: 'DAPP' },
  { category: 'VACCINE', label: 'Da2PP' },
  { category: 'VACCINE', label: 'Da2pp + Lepto' },
  { category: 'VACCINE', label: 'Rv Vaccine' },
  { category: 'VACCINE', label: 'Dap' },
  { category: 'VACCINE', label: 'Parvovirus' },
  { category: 'VACCINE', label: 'Hepatitis/Adenovirus' },
  { category: 'VACCINE', label: 'Rabies', required: true },
  { category: 'COAT_COLOR', label: 'Apricot' },
  { category: 'COAT_COLOR', label: 'Blonde' },
  { category: 'COAT_COLOR', label: 'Tan and White' },
  { category: 'COAT_COLOR', label: 'Grey' },
  { category: 'COAT_COLOR', label: 'Black' },
  { category: 'COAT_COLOR', label: 'Brown' },
  { category: 'COAT_COLOR', label: 'Brindle' },
  { category: 'COAT_COLOR', label: 'White' },
  { category: 'PET_TAG', label: 'VIP' },
  { category: 'PET_TAG', label: 'Special Needs' },
];

export interface SaveOptionDto {
  category: PetOptionCategory;
  label: string;
  parentId?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  required?: boolean;
}

@Injectable()
export class PetOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Seed the baseline catalog the first time a tenant opens Pet Options. */
  private async ensureSeeded(tenantId: string) {
    const count = await this.prisma.db.petOption.count();
    if (count > 0) return;
    await this.prisma.db.petOption.createMany({
      data: SEED.map((s, i) => ({
        tenantId, category: s.category, label: s.label, sortOrder: i,
        minValue: s.min ?? null, maxValue: s.max ?? null, required: s.required ?? false,
      })),
    });
  }

  /** All options grouped by category (auto-seeds on first call). */
  async listAll(tenantId: string) {
    await this.ensureSeeded(tenantId);
    const rows = await this.prisma.db.petOption.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] });
    const grouped: Record<string, typeof rows> = {};
    for (const c of PET_OPTION_CATEGORIES) grouped[c] = [];
    for (const r of rows) (grouped[r.category] ??= []).push(r);
    return grouped;
  }

  async create(tenantId: string, dto: SaveOptionDto) {
    if (!PET_OPTION_CATEGORIES.includes(dto.category)) throw new BadRequestException('Invalid category');
    if (!dto.label?.trim()) throw new BadRequestException('Label required');
    const max = await this.prisma.db.petOption.aggregate({ where: { category: dto.category }, _max: { sortOrder: true } });
    const opt = await this.prisma.db.petOption.create({
      data: {
        tenantId, category: dto.category, label: dto.label.trim(),
        parentId: dto.parentId ?? null, minValue: dto.minValue ?? null, maxValue: dto.maxValue ?? null,
        required: dto.required ?? false, sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.log({ action: 'PET_OPTION_CREATE', entityType: 'pet_option', entityId: opt.id, metadata: { category: dto.category } });
    return opt;
  }

  async update(id: string, dto: Partial<SaveOptionDto>) {
    return this.prisma.db.petOption.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label.trim() }),
        ...(dto.minValue !== undefined && { minValue: dto.minValue }),
        ...(dto.maxValue !== undefined && { maxValue: dto.maxValue }),
        ...(dto.required !== undefined && { required: dto.required }),
      },
    });
  }

  async reorder(category: PetOptionCategory, orderedIds: string[]) {
    await this.prisma.db.$transaction(
      orderedIds.map((id, i) => this.prisma.db.petOption.update({ where: { id }, data: { sortOrder: i } })),
    );
    return { ok: true };
  }

  /**
   * Delete with the spec's cascade-deletion guard: block if the option value is
   * currently referenced by an active pet profile.
   */
  async remove(id: string) {
    const opt = await this.prisma.db.petOption.findUnique({ where: { id } });
    if (!opt) throw new BadRequestException('Option not found');
    const inUse = await this.usageCount(opt.category as PetOptionCategory, opt.label, opt.id);
    if (inUse > 0) {
      throw new BadRequestException(`Cannot delete "${opt.label}" — it is assigned to ${inUse} pet profile(s). Reassign or clear them first.`);
    }
    // Breeds (children) go with their parent type.
    if (opt.category === 'PET_TYPE') {
      await this.prisma.db.petOption.deleteMany({ where: { parentId: opt.id } });
    }
    await this.prisma.db.petOption.delete({ where: { id } });
    await this.audit.log({ action: 'PET_OPTION_DELETE', entityType: 'pet_option', entityId: id });
  }

  /** How many pets reference this option value (categories mapped to Pet columns). */
  private async usageCount(category: PetOptionCategory, label: string, id: string): Promise<number> {
    const db = this.prisma.db;
    switch (category) {
      case 'PET_TYPE':
        return db.pet.count({ where: { species: { equals: label, mode: 'insensitive' } } });
      case 'BREED':
        return db.pet.count({ where: { breed: { equals: label, mode: 'insensitive' } } });
      case 'HAIR':
        return db.pet.count({ where: { hairLength: { equals: label, mode: 'insensitive' } } });
      case 'BEHAVIOR':
      case 'PET_TAG':
        return db.pet.count({ where: { tags: { has: label } } });
      case 'VACCINE':
        return db.vaccinationRecord.count({ where: { vaccineType: { equals: label, mode: 'insensitive' } } });
      default:
        return 0; // WEIGHT / FIXED / COAT_COLOR not stored as a direct label column
    }
  }

  /** Required-vaccine alert config: the set of vaccines flagged required. */
  async vaccineAlert(tenantId: string) {
    await this.ensureSeeded(tenantId);
    const vaccines = await this.prisma.db.petOption.findMany({ where: { category: 'VACCINE' }, orderBy: { sortOrder: 'asc' } });
    const required = vaccines.filter(v => v.required).map(v => v.label);
    return { active: required.length > 0, required, all: vaccines.map(v => v.label) };
  }
}
