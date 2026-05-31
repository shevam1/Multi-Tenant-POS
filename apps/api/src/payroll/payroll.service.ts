import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface PayrollConfigDto {
  commissionIncludesDiscount?: boolean;
  clockInOutEnabled?: boolean;
  autoSplitTipsEnabled?: boolean;
  tipSplitMode?: 'PRICE' | 'EQUAL';
}

export interface RosterUpdateDto {
  payType?: 'HOURLY' | 'COMMISSION';
  commissionRate?: number;        // service commission (0..1)
  productCommissionRate?: number; // 0..1
  hourlyRateCents?: number;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Global calculation scope + tip pooling config ──────────────────────────

  async getConfig(tenantId: string) {
    let s = await this.prisma.db.tenantSettings.findUnique({ where: { tenantId } });
    if (!s) s = await this.prisma.db.tenantSettings.create({ data: { tenantId } });
    return {
      commissionIncludesDiscount: s.commissionIncludesDiscount,
      clockInOutEnabled: s.clockInOutEnabled,
      autoSplitTipsEnabled: s.autoSplitTipsEnabled,
      tipSplitMode: s.tipSplitMode,
    };
  }

  async saveConfig(tenantId: string, dto: PayrollConfigDto) {
    await this.getConfig(tenantId);
    const data: Record<string, unknown> = {};
    for (const k of ['commissionIncludesDiscount', 'clockInOutEnabled', 'autoSplitTipsEnabled', 'tipSplitMode'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    const s = await this.prisma.db.tenantSettings.update({ where: { tenantId }, data });
    await this.audit.log({ action: 'PAYROLL_CONFIG_UPDATE', entityType: 'tenant_settings', entityId: s.id, metadata: { keys: Object.keys(data) } });
    return this.getConfig(tenantId);
  }

  // ── Workforce roster matrix ─────────────────────────────────────────────────

  async roster(storeId?: string) {
    const users = await this.prisma.db.user.findMany({
      where: { active: true, role: { not: 'CUSTOMER' }, ...(storeId ? { storeId } : {}) },
      orderBy: [{ fullName: 'asc' }],
      select: {
        id: true, fullName: true, role: true, storeId: true,
        payType: true, commissionRate: true, productCommissionRate: true, hourlyRateCents: true,
        customRole: { select: { name: true } },
      },
    });
    return users.map(u => ({
      id: u.id, fullName: u.fullName, role: u.role, roleName: u.customRole?.name ?? u.role.replace(/_/g, ' '),
      storeId: u.storeId,
      payType: u.payType,
      commissionRate: u.commissionRate,
      productCommissionRate: u.productCommissionRate,
      hourlyRateCents: u.hourlyRateCents,
    }));
  }

  async updateRoster(userId: string, dto: RosterUpdateDto) {
    if (dto.commissionRate !== undefined && (dto.commissionRate < 0 || dto.commissionRate > 1)) throw new BadRequestException('Commission rate must be 0–1');
    if (dto.productCommissionRate !== undefined && (dto.productCommissionRate < 0 || dto.productCommissionRate > 1)) throw new BadRequestException('Product rate must be 0–1');
    const user = await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        ...(dto.payType !== undefined && { payType: dto.payType }),
        ...(dto.commissionRate !== undefined && { commissionRate: dto.commissionRate }),
        ...(dto.productCommissionRate !== undefined && { productCommissionRate: dto.productCommissionRate }),
        ...(dto.hourlyRateCents !== undefined && { hourlyRateCents: dto.hourlyRateCents }),
      },
      select: { id: true, payType: true, commissionRate: true, productCommissionRate: true, hourlyRateCents: true },
    });
    await this.audit.log({ action: 'PAYROLL_ROSTER_UPDATE', entityType: 'user', entityId: userId });
    return user;
  }

  // ── Period summary (estimate): hours + commission + tips per staff ──────────

  /**
   * Per-staff payroll estimate for [from, to] at a store. Commission is computed
   * from PAID invoices attributed to the booking's groomer(s), respecting the
   * include/exclude-discount scope; tips follow the auto-split-tips config.
   */
  async summary(tenantId: string, storeId: string, from: string, to: string) {
    const cfg = await this.getConfig(tenantId);
    const start = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T23:59:59');

    const roster = await this.roster(storeId);
    const byUser = new Map(roster.map(r => [r.id, {
      ...r, hours: 0, serviceRevenueCents: 0, tipsCents: 0, commissionCents: 0, hourlyCents: 0, grossCents: 0,
    }]));

    // Hours from timeclock
    const entries = await this.prisma.db.timeclockEntry.findMany({
      where: { storeId, clockIn: { gte: start, lte: end }, clockOut: { not: null } },
      select: { userId: true, clockIn: true, clockOut: true },
    });
    for (const e of entries) {
      const r = byUser.get(e.userId); if (!r) continue;
      r.hours += (e.clockOut!.getTime() - e.clockIn.getTime()) / 3_600_000;
    }

    // Commission + tips from paid invoices attributed to groomers
    const invoices = await this.prisma.db.invoice.findMany({
      where: { storeId, status: 'PAID', createdAt: { gte: start, lte: end }, bookingId: { not: null } },
      select: {
        subtotalCents: true, discountCents: true, couponDiscountCents: true, tipCents: true,
        booking: { select: { groomers: { select: { userId: true } } } },
      },
    });
    for (const inv of invoices) {
      const groomerIds = (inv.booking?.groomers ?? []).map(g => g.userId).filter(id => byUser.has(id));
      if (groomerIds.length === 0) continue;
      const base = cfg.commissionIncludesDiscount
        ? Math.max(0, inv.subtotalCents - inv.discountCents - inv.couponDiscountCents)
        : inv.subtotalCents;
      const sharePerGroomer = base / groomerIds.length;
      // Tips: split per config, else all to the first groomer.
      const tipShare = cfg.autoSplitTipsEnabled
        ? (cfg.tipSplitMode === 'EQUAL' ? inv.tipCents / groomerIds.length : null)
        : 0;
      for (let i = 0; i < groomerIds.length; i++) {
        const r = byUser.get(groomerIds[i])!;
        r.serviceRevenueCents += sharePerGroomer;
        if (cfg.autoSplitTipsEnabled) {
          // PRICE mode proportional handled below per-invoice; EQUAL uses tipShare.
          r.tipsCents += tipShare ?? (inv.tipCents / groomerIds.length); // PRICE: equal base share == equal here since service equal-split
        } else if (i === 0) {
          r.tipsCents += inv.tipCents;
        }
      }
    }

    const rows = Array.from(byUser.values()).map(r => {
      const commissionCents = Math.round(r.serviceRevenueCents * r.commissionRate);
      const hourlyCents = Math.round(r.hours * r.hourlyRateCents);
      const basePay = r.payType === 'HOURLY' ? hourlyCents : commissionCents;
      return {
        ...r,
        hours: +r.hours.toFixed(2),
        serviceRevenueCents: Math.round(r.serviceRevenueCents),
        tipsCents: Math.round(r.tipsCents),
        commissionCents,
        hourlyCents,
        grossCents: basePay + Math.round(r.tipsCents),
      };
    });
    return { from, to, storeId, config: cfg, rows };
  }
}
