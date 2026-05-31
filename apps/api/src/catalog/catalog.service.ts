import { Injectable, NotFoundException } from '@nestjs/common';
import type { CatalogItemKind } from '@omnipos/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface SaveCatalogItemDto {
  kind: CatalogItemKind;
  name: string;
  description?: string;
  basePriceCents: number;
  durationMin?: number;
  active?: boolean;
  categoryId?: string | null;
  taxable?: boolean;
  bookOnline?: boolean;
  species?: string[];
  hairLengths?: string[];
  breeds?: string[];
  minWeightKg?: number | null;
  maxWeightKg?: number | null;
}

/** Pet attributes used to filter eligible services on the public booking site. */
export interface PetFilter {
  species?: string;
  hairLength?: string;
  breed?: string;
  weightKg?: number;
}

export interface StoreOverrideDto {
  storeId: string;
  priceCents: number | null;
  available: boolean;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** All catalog items with their per-store overrides + category (admin view). */
  async list() {
    return this.prisma.db.catalogItem.findMany({
      orderBy: [{ kind: 'asc' }, { basePriceCents: 'asc' }],
      include: { storeOverrides: true, category: { select: { id: true, name: true } } },
    });
  }

  async create(dto: SaveCatalogItemDto, tenantId: string) {
    const item = await this.prisma.db.catalogItem.create({
      data: {
        tenantId,
        kind: dto.kind,
        name: dto.name,
        description: dto.description,
        basePriceCents: dto.basePriceCents,
        durationMin: dto.durationMin,
        active: dto.active ?? true,
        categoryId: dto.categoryId ?? null,
        taxable: dto.taxable ?? true,
        bookOnline: dto.bookOnline ?? true,
        species: dto.species ?? [],
        hairLengths: dto.hairLengths ?? [],
        breeds: dto.breeds ?? [],
        minWeightKg: dto.minWeightKg ?? null,
        maxWeightKg: dto.maxWeightKg ?? null,
      },
    });
    await this.audit.log({ action: 'CATALOG_CREATE', entityType: 'catalog_item', entityId: item.id });
    return item;
  }

  async update(id: string, dto: Partial<SaveCatalogItemDto>) {
    const item = await this.prisma.db.catalogItem.update({
      where: { id },
      data: {
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.basePriceCents !== undefined && { basePriceCents: dto.basePriceCents }),
        ...(dto.durationMin !== undefined && { durationMin: dto.durationMin }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.taxable !== undefined && { taxable: dto.taxable }),
        ...(dto.bookOnline !== undefined && { bookOnline: dto.bookOnline }),
        ...(dto.species !== undefined && { species: dto.species }),
        ...(dto.hairLengths !== undefined && { hairLengths: dto.hairLengths }),
        ...(dto.breeds !== undefined && { breeds: dto.breeds }),
        ...(dto.minWeightKg !== undefined && { minWeightKg: dto.minWeightKg }),
        ...(dto.maxWeightKg !== undefined && { maxWeightKg: dto.maxWeightKg }),
      },
    });
    await this.audit.log({ action: 'CATALOG_UPDATE', entityType: 'catalog_item', entityId: id });
    return item;
  }

  async remove(id: string) {
    await this.prisma.db.catalogItem.update({ where: { id }, data: { active: false } });
    await this.audit.log({ action: 'CATALOG_DEACTIVATE', entityType: 'catalog_item', entityId: id });
  }

  /** Duplicate an item (clone all properties to a new template). */
  async duplicate(id: string, tenantId: string) {
    const src = await this.prisma.db.catalogItem.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('Item not found');
    const item = await this.prisma.db.catalogItem.create({
      data: {
        tenantId, kind: src.kind, name: `${src.name} (copy)`, description: src.description,
        basePriceCents: src.basePriceCents, durationMin: src.durationMin, active: src.active,
        categoryId: src.categoryId, taxable: src.taxable, bookOnline: src.bookOnline,
        species: src.species, hairLengths: src.hairLengths, breeds: src.breeds,
        minWeightKg: src.minWeightKg, maxWeightKg: src.maxWeightKg,
        attributes: src.attributes as object,
      },
    });
    await this.audit.log({ action: 'CATALOG_DUPLICATE', entityType: 'catalog_item', entityId: item.id, metadata: { from: id } });
    return item;
  }

  // ── Service categories ─────────────────────────────────────────────────────

  listCategories() {
    return this.prisma.db.serviceCategory.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createCategory(name: string, tenantId: string) {
    const max = await this.prisma.db.serviceCategory.aggregate({ _max: { sortOrder: true } });
    return this.prisma.db.serviceCategory.create({ data: { tenantId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  }

  renameCategory(id: string, name: string) {
    return this.prisma.db.serviceCategory.update({ where: { id }, data: { name } });
  }

  /** Reorder categories (drag-and-drop) — ordered array of category ids. */
  async reorderCategories(orderedIds: string[]) {
    await this.prisma.db.$transaction(
      orderedIds.map((id, i) => this.prisma.db.serviceCategory.update({ where: { id }, data: { sortOrder: i } })),
    );
    return this.listCategories();
  }

  async deleteCategory(id: string) {
    const count = await this.prisma.db.catalogItem.count({ where: { categoryId: id, active: true } });
    if (count > 0) throw new NotFoundException('Category has active items — move or remove them first');
    await this.prisma.db.serviceCategory.delete({ where: { id } });
  }

  /** Batch raise-price for a category: fixed cents or percent. */
  async raisePrice(categoryId: string, mode: 'FIXED' | 'PERCENT', value: number) {
    const items = await this.prisma.db.catalogItem.findMany({ where: { categoryId, active: true } });
    await this.prisma.db.$transaction(items.map(it => {
      const next = mode === 'PERCENT'
        ? Math.round(it.basePriceCents * (1 + value / 100))
        : it.basePriceCents + value;
      return this.prisma.db.catalogItem.update({ where: { id: it.id }, data: { basePriceCents: Math.max(0, next) } });
    }));
    await this.audit.log({ action: 'CATALOG_RAISE_PRICE', entityType: 'service_category', entityId: categoryId, metadata: { mode, value, items: items.length } });
    return { updated: items.length };
  }

  /** Replace the per-store pricing/availability matrix for an item. */
  async setStoreOverrides(itemId: string, overrides: StoreOverrideDto[], tenantId: string) {
    const item = await this.prisma.db.catalogItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Catalog item not found');

    await this.prisma.db.$transaction(
      overrides.map(o =>
        this.prisma.db.catalogItemStore.upsert({
          where: { catalogItemId_storeId: { catalogItemId: itemId, storeId: o.storeId } },
          update: { priceCents: o.priceCents, available: o.available },
          create: { tenantId, catalogItemId: itemId, storeId: o.storeId, priceCents: o.priceCents, available: o.available },
        }),
      ),
    );
    await this.audit.log({ action: 'CATALOG_STORE_PRICING', entityType: 'catalog_item', entityId: itemId });
    return this.prisma.db.catalogItem.findUnique({ where: { id: itemId }, include: { storeOverrides: true } });
  }

  /**
   * Catalog available at a given store, with location-specific pricing resolved.
   * Used by the public booking site. An item with NO override row for the store
   * is available everywhere at base price; an override can hide it or reprice it.
   */
  async catalogForStore(tenantId: string, storeId: string, pet?: PetFilter) {
    const items = await this.prisma.forTenant(tenantId).catalogItem.findMany({
      where: { active: true, bookOnline: true },   // only online-visible services
      include: { storeOverrides: { where: { storeId } } },
      orderBy: [{ kind: 'asc' }, { basePriceCents: 'asc' }],
    });

    return items
      .filter(item => CatalogService.eligibleForPet(item, pet))
      .map(item => {
        const ov = item.storeOverrides[0];
        return {
          id: item.id,
          kind: item.kind,
          name: item.name,
          description: item.description,
          durationMin: item.durationMin,
          priceCents: ov?.priceCents ?? item.basePriceCents,
          available: ov ? ov.available : true,
          // Eligibility fields so the multi-pet booking UI can filter per pet.
          species: item.species,
          hairLengths: item.hairLengths,
          breeds: item.breeds,
          minWeightKg: item.minWeightKg,
          maxWeightKg: item.maxWeightKg,
        };
      })
      .filter(i => i.available);
  }

  /**
   * Service-eligibility match: an empty filter array means "applies to all".
   * Returns true when no pet is supplied (unfiltered browse).
   */
  static eligibleForPet(
    item: { species: string[]; hairLengths: string[]; breeds: string[]; minWeightKg: number | null; maxWeightKg: number | null },
    pet?: PetFilter,
  ): boolean {
    if (!pet) return true;
    if (item.species.length && pet.species && !item.species.includes(pet.species)) return false;
    if (item.hairLengths.length && pet.hairLength && !item.hairLengths.includes(pet.hairLength)) return false;
    if (item.breeds.length && pet.breed && !item.breeds.includes(pet.breed)) return false;
    if (pet.weightKg != null) {
      if (item.minWeightKg != null && pet.weightKg < item.minWeightKg) return false;
      if (item.maxWeightKg != null && pet.weightKg > item.maxWeightKg) return false;
    }
    return true;
  }
}
