import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface SaveProductDto {
  storeId: string;
  name: string;
  sku?: string;
  barcode?: string;
  categoryId?: string | null;
  supplierId?: string | null;
  priceCents: number;
  costCents?: number;
  stockQty?: number;
  reorderLevel?: number;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Products ───────────────────────────────────────────────────────────────

  listProducts(storeId?: string) {
    return this.prisma.db.product.findMany({
      where: { active: true, ...(storeId ? { storeId } : {}) },
      orderBy: { name: 'asc' },
      include: { category: { select: { name: true } }, supplier: { select: { name: true } } },
    });
  }

  /** Products available to sell at a store (in stock). */
  sellable(storeId: string) {
    return this.prisma.db.product.findMany({
      where: { active: true, storeId, stockQty: { gt: 0 } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, priceCents: true, stockQty: true, sku: true },
    });
  }

  async createProduct(dto: SaveProductDto, tenantId: string) {
    const product = await this.prisma.db.product.create({
      data: {
        tenantId, storeId: dto.storeId, name: dto.name, sku: dto.sku, barcode: dto.barcode,
        categoryId: dto.categoryId ?? null, supplierId: dto.supplierId ?? null,
        priceCents: dto.priceCents, costCents: dto.costCents ?? 0,
        stockQty: dto.stockQty ?? 0, reorderLevel: dto.reorderLevel ?? 0,
      },
    });
    await this.audit.log({ action: 'PRODUCT_CREATE', entityType: 'product', entityId: product.id });
    return product;
  }

  async updateProduct(id: string, dto: Partial<SaveProductDto>) {
    const product = await this.prisma.db.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
        ...(dto.costCents !== undefined && { costCents: dto.costCents }),
        ...(dto.stockQty !== undefined && { stockQty: dto.stockQty }),
        ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
      },
    });
    await this.audit.log({ action: 'PRODUCT_UPDATE', entityType: 'product', entityId: id });
    return product;
  }

  async removeProduct(id: string) {
    await this.prisma.db.product.update({ where: { id }, data: { active: false } });
    await this.audit.log({ action: 'PRODUCT_DELETE', entityType: 'product', entityId: id });
  }

  /** Adjust stock by a delta (receiving / shrinkage). */
  async adjustStock(id: string, delta: number) {
    return this.prisma.db.product.update({ where: { id }, data: { stockQty: { increment: delta } } });
  }

  /** Decrement stock for sold products (called from POS checkout). */
  async recordSale(items: { productId: string; qty: number }[]) {
    for (const it of items) {
      await this.prisma.db.product.update({ where: { id: it.productId }, data: { stockQty: { decrement: it.qty } } });
    }
  }

  // ── Categories ───────────────────────────────────────────────────────────────

  listCategories() {
    return this.prisma.db.productCategory.findMany({ orderBy: { name: 'asc' } });
  }
  async createCategory(name: string, tenantId: string) {
    const exists = await this.prisma.db.productCategory.findFirst({ where: { name } });
    if (exists) throw new BadRequestException('Category already exists');
    return this.prisma.db.productCategory.create({ data: { tenantId, name } });
  }

  // ── Suppliers ──────────────────────────────────────────────────────────────

  listSuppliers() {
    return this.prisma.db.supplier.findMany({ orderBy: { name: 'asc' } });
  }
  createSupplier(dto: { name: string; contactName?: string; phone?: string; email?: string; notes?: string }, tenantId: string) {
    return this.prisma.db.supplier.create({ data: { tenantId, ...dto } });
  }
  updateSupplier(id: string, dto: { name?: string; contactName?: string; phone?: string; email?: string; notes?: string }) {
    return this.prisma.db.supplier.update({ where: { id }, data: dto });
  }
}
