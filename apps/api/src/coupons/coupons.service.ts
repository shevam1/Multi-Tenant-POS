import { BadRequestException, Injectable } from '@nestjs/common';
import type { CouponType } from '@omnipos/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface SaveCouponDto {
  code: string;
  description?: string;
  type: CouponType;
  value: number;
  minSubtotalCents?: number;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  active?: boolean;
}

export interface CouponValidation {
  valid: boolean;
  reason?: string;
  couponId?: string;
  code?: string;
  discountCents?: number;
}

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.db.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: SaveCouponDto, tenantId: string) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.db.coupon.findFirst({ where: { code } });
    if (existing) throw new BadRequestException('A coupon with that code already exists');
    if (dto.type === 'PERCENT' && (dto.value < 1 || dto.value > 100)) {
      throw new BadRequestException('Percent value must be 1-100');
    }
    const coupon = await this.prisma.db.coupon.create({
      data: {
        tenantId, code,
        description: dto.description,
        type: dto.type,
        value: dto.value,
        minSubtotalCents: dto.minSubtotalCents ?? 0,
        maxRedemptions: dto.maxRedemptions ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        active: dto.active ?? true,
      },
    });
    await this.audit.log({ action: 'COUPON_CREATE', entityType: 'coupon', entityId: coupon.id });
    return coupon;
  }

  async update(id: string, dto: Partial<SaveCouponDto>) {
    const coupon = await this.prisma.db.coupon.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.minSubtotalCents !== undefined && { minSubtotalCents: dto.minSubtotalCents }),
        ...(dto.maxRedemptions !== undefined && { maxRedemptions: dto.maxRedemptions }),
        ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });
    await this.audit.log({ action: 'COUPON_UPDATE', entityType: 'coupon', entityId: id });
    return coupon;
  }

  async remove(id: string) {
    await this.prisma.db.coupon.update({ where: { id }, data: { active: false } });
    await this.audit.log({ action: 'COUPON_DEACTIVATE', entityType: 'coupon', entityId: id });
  }

  /**
   * Validate a coupon code against a service subtotal and compute the discount.
   * Does not mutate redemption count — call redeem() at checkout.
   */
  async validate(code: string, subtotalCents: number): Promise<CouponValidation> {
    const coupon = await this.prisma.db.coupon.findFirst({ where: { code: code.trim().toUpperCase() } });
    if (!coupon) return { valid: false, reason: 'Coupon not found' };
    if (!coupon.active) return { valid: false, reason: 'Coupon is inactive' };
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return { valid: false, reason: 'Coupon has expired' };
    if (coupon.maxRedemptions != null && coupon.timesRedeemed >= coupon.maxRedemptions) {
      return { valid: false, reason: 'Coupon redemption limit reached' };
    }
    if (subtotalCents < coupon.minSubtotalCents) {
      return { valid: false, reason: `Minimum spend $${(coupon.minSubtotalCents / 100).toFixed(2)} required` };
    }

    const discountCents = coupon.type === 'PERCENT'
      ? Math.round(subtotalCents * (coupon.value / 100))
      : Math.min(coupon.value, subtotalCents);

    return { valid: true, couponId: coupon.id, code: coupon.code, discountCents };
  }

  /** Increment redemption count after a successful checkout. */
  async redeem(couponId: string) {
    await this.prisma.db.coupon.update({
      where: { id: couponId },
      data: { timesRedeemed: { increment: 1 } },
    });
  }
}
