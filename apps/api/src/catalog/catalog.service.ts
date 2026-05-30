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

  /** All catalog items with their per-store overrides (admin view). */
  async list() {
    return this.prisma.db.catalogItem.findMany({
      orderBy: [{ kind: 'asc' }, { basePriceCents: 'asc' }],
      include: { storeOverrides: true },
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
      },
    });
    await this.audit.log({ action: 'CATALOG_UPDATE', entityType: 'catalog_item', entityId: id });
    return item;
  }

  async remove(id: string) {
    await this.prisma.db.catalogItem.update({ where: { id }, data: { active: false } });
    await this.audit.log({ action: 'CATALOG_DEACTIVATE', entityType: 'catalog_item', entityId: id });
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
  async catalogForStore(tenantId: string, storeId: string) {
    const items = await this.prisma.forTenant(tenantId).catalogItem.findMany({
      where: { active: true },
      include: { storeOverrides: { where: { storeId } } },
      orderBy: [{ kind: 'asc' }, { basePriceCents: 'asc' }],
    });

    return items
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
        };
      })
      .filter(i => i.available);
  }
}
