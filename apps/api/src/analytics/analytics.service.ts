import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DateRange { from: string; to: string }

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Revenue ──────────────────────────────────────────────────────────────

  /**
   * Revenue summary across all stores for the tenant.
   * Spec §13: cross-store revenue/bookings dashboards for HQ admin.
   */
  async revenueSummary(range: DateRange) {
    const { from, to } = this.dateRange(range);

    const invoices = await this.prisma.db.invoice.findMany({
      where: { createdAt: { gte: from, lte: to }, status: 'PAID' },
      include: { store: { select: { id: true, name: true, province: true } } },
    });

    // Per-store breakdown
    const byStore = new Map<string, {
      storeId: string; storeName: string; province: string;
      revenueCents: number; discountCents: number; taxCents: number; tipCents: number; invoiceCount: number;
    }>();

    for (const inv of invoices) {
      const key = inv.storeId;
      if (!byStore.has(key)) {
        byStore.set(key, {
          storeId: inv.storeId,
          storeName: inv.store.name,
          province: inv.store.province,
          revenueCents: 0, discountCents: 0, taxCents: 0, tipCents: 0, invoiceCount: 0,
        });
      }
      const s = byStore.get(key)!;
      s.revenueCents += inv.totalCents;
      s.discountCents += inv.discountCents;
      s.taxCents += inv.taxCents;
      s.tipCents += inv.tipCents;
      s.invoiceCount += 1;
    }

    const stores = Array.from(byStore.values()).sort((a, b) => b.revenueCents - a.revenueCents);
    const totalRevenueCents = stores.reduce((s, r) => s + r.revenueCents, 0);
    const totalInvoices = stores.reduce((s, r) => s + r.invoiceCount, 0);

    return { totalRevenueCents, totalInvoices, stores };
  }

  // ── Bookings ─────────────────────────────────────────────────────────────

  async bookingsSummary(range: DateRange) {
    const { from, to } = this.dateRange(range);

    const bookings = await this.prisma.db.booking.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { store: { select: { id: true, name: true } } },
    });

    const total = bookings.length;
    const byStatus = this.groupCount(bookings, b => b.status);
    const bySource = this.groupCount(bookings, b => b.source ?? 'POS');

    const byStoreMap = bookings.reduce((m, b) => {
      const k = b.storeId;
      if (!m.has(k)) m.set(k, { storeId: k, storeName: b.store.name, total: 0, completed: 0, noShow: 0, cancelled: 0 });
      const s = m.get(k)!;
      s.total += 1;
      if (b.status === 'COMPLETED') s.completed += 1;
      if (b.status === 'NO_SHOW') s.noShow += 1;
      if (b.status === 'CANCELLED') s.cancelled += 1;
      return m;
    }, new Map<string, { storeId: string; storeName: string; total: number; completed: number; noShow: number; cancelled: number }>());

    const completionRate = total > 0 ? Math.round((byStatus['COMPLETED'] ?? 0) / total * 100) : 0;
    const noShowRate = total > 0 ? Math.round((byStatus['NO_SHOW'] ?? 0) / total * 100) : 0;

    return {
      total,
      completionRate,
      noShowRate,
      byStatus,
      bySource,
      byStore: [...byStoreMap.values()].sort((a, b) => b.total - a.total),
    };
  }

  // ── Membership & loyalty ─────────────────────────────────────────────────

  async membershipSummary() {
    const [active, byTier, totalPoints] = await Promise.all([
      this.prisma.db.membership.count({ where: { status: 'ACTIVE' } }),
      this.prisma.db.membership.groupBy({ by: ['planId'], where: { status: 'ACTIVE' }, _count: true }),
      this.prisma.db.customer.aggregate({ _sum: { loyaltyPoints: true } }),
    ]);

    // Resolve tier names
    const plans = await this.prisma.db.membershipPlan.findMany({ where: { active: true } });
    const planMap = new Map(plans.map(p => [p.id, p.tier]));

    return {
      activeMembers: active,
      totalLoyaltyPoints: totalPoints._sum.loyaltyPoints ?? 0,
      byTier: byTier.map(r => ({ tier: planMap.get(r.planId) ?? r.planId, count: r._count })),
    };
  }

  // ── Staff hours ───────────────────────────────────────────────────────────

  async staffHoursSummary(range: DateRange) {
    const { from, to } = this.dateRange(range);

    const entries = await this.prisma.db.timeclockEntry.findMany({
      where: { clockIn: { gte: from, lte: to }, clockOut: { not: null } },
      include: { user: { select: { fullName: true } }, store: { select: { name: true } } },
    });

    const byUser = new Map<string, { fullName: string; storeName: string; minutes: number }>();
    for (const e of entries) {
      const key = e.userId;
      if (!byUser.has(key)) byUser.set(key, { fullName: e.user.fullName, storeName: e.store.name, minutes: 0 });
      byUser.get(key)!.minutes += Math.round((e.clockOut!.getTime() - e.clockIn.getTime()) / 60_000);
    }

    return Array.from(byUser.values())
      .map(u => ({ ...u, totalHours: +(u.minutes / 60).toFixed(2) }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }

  // ── Trending services ─────────────────────────────────────────────────────

  async topServices(range: DateRange, limit = 10) {
    const { from, to } = this.dateRange(range);

    // InvoiceLine has no createdAt — filter via parent invoice date
    const lines = await this.prisma.db.invoiceLine.findMany({
      where: { invoice: { createdAt: { gte: from, lte: to }, status: 'PAID' } },
    });

    const byService = new Map<string, { name: string; count: number; revenueCents: number }>();
    for (const line of lines) {
      const key = line.description;
      if (!byService.has(key)) byService.set(key, { name: key, count: 0, revenueCents: 0 });
      byService.get(key)!.count += 1;
      byService.get(key)!.revenueCents += line.amountCents;
    }

    return Array.from(byService.values()).sort((a, b) => b.revenueCents - a.revenueCents).slice(0, limit);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private dateRange({ from, to }: DateRange) {
    return {
      from: new Date(from + 'T00:00:00Z'),
      to: new Date(to + 'T23:59:59Z'),
    };
  }

  private groupCount<T>(items: T[], key: (item: T) => string): Record<string, number> {
    return items.reduce((acc, item) => {
      const k = key(item);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
