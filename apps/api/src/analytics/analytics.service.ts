import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DateRange { from: string; to: string }
export interface ReportFilters {
  from: string;
  to: string;
  storeId?: string;
  groomerId?: string;
  period?: 'day' | 'week' | 'month' | 'year';
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Comprehensive report (honors location + groomer + date filters) ────────

  /**
   * One-shot analytics report driven by selector combination.
   * All sections respect storeId (location) and groomerId filters.
   */
  async report(f: ReportFilters) {
    const from = new Date(f.from + 'T00:00:00Z');
    const to = new Date(f.to + 'T23:59:59Z');
    const period = f.period ?? 'day';

    // Bookings in range (filtered by store + groomer)
    const bookings = await this.prisma.db.booking.findMany({
      where: {
        scheduledStart: { gte: from, lte: to },
        ...(f.storeId ? { storeId: f.storeId } : {}),
        ...(f.groomerId ? { assignedGroomerId: f.groomerId } : {}),
      },
      include: {
        store: { select: { id: true, name: true } },
        lineItems: { select: { description: true, unitPriceCents: true } },
        extraPets: { select: { id: true } },
        invoice: {
          include: { payments: { select: { tender: true, amountCents: true } }, lines: { select: { description: true, amountCents: true } } },
        },
      },
    });

    // Resolve staff names (any role can be assigned to a booking)
    const groomers = await this.prisma.db.user.findMany({
      where: { role: { not: 'CUSTOMER' }, ...(f.storeId ? { storeId: f.storeId } : {}) },
      select: { id: true, fullName: true, commissionRate: true },
    });
    const groomerMap = new Map(groomers.map(g => [g.id, g]));

    // ── Summary ──────────────────────────────────────────────────────────
    const paidBookings = bookings.filter(b => b.invoice?.status === 'PAID');
    const earnedRevenueCents = paidBookings.reduce((s, b) => s + (b.invoice?.totalCents ?? 0), 0);
    const expectedRevenueCents = bookings
      .filter(b => b.status !== 'CANCELLED')
      .reduce((s, b) => s + b.lineItems.reduce((ls, l) => ls + l.unitPriceCents, 0), 0);
    const totalPets = bookings.reduce((s, b) => s + (b.petId ? 1 : 0) + b.extraPets.length, 0);

    const summary = {
      totalAppts: bookings.length,
      totalPets,
      earnedRevenueCents,
      expectedRevenueCents,
    };

    // ── Revenue trend (bucketed by period) ─────────────────────────────────
    const trendMap = new Map<string, number>();
    for (const b of paidBookings) {
      const bucket = this.bucketKey(b.scheduledStart, period);
      trendMap.set(bucket, (trendMap.get(bucket) ?? 0) + (b.invoice?.totalCents ?? 0));
    }
    const revenueTrend = [...trendMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, revenueCents]) => ({ bucket, revenueCents }));

    // ── Revenue / commission / tips by staff ───────────────────────────────
    const staffMap = new Map<string, { name: string; revenueCents: number; commissionCents: number; tipsCents: number; appts: number }>();
    const ensureStaff = (id: string) => {
      if (!staffMap.has(id)) staffMap.set(id, { name: groomerMap.get(id)?.fullName ?? 'Unassigned', revenueCents: 0, commissionCents: 0, tipsCents: 0, appts: 0 });
      return staffMap.get(id)!;
    };
    for (const b of paidBookings) {
      const gid = b.assignedGroomerId ?? 'unassigned';
      const s = ensureStaff(gid);
      const serviceRev = (b.invoice?.subtotalCents ?? 0);
      const rate = groomerMap.get(gid)?.commissionRate ?? 0.4;
      s.revenueCents += b.invoice?.totalCents ?? 0;
      s.commissionCents += Math.round(serviceRev * rate);
      s.tipsCents += b.invoice?.tipCents ?? 0;
      s.appts += 1;
    }
    const byStaff = [...staffMap.values()].sort((a, b) => b.revenueCents - a.revenueCents);

    // ── Sales items ─────────────────────────────────────────────────────────
    const itemMap = new Map<string, { name: string; count: number; revenueCents: number }>();
    for (const b of paidBookings) {
      for (const line of b.invoice?.lines ?? []) {
        const key = line.description.split(' — ')[0];
        if (!itemMap.has(key)) itemMap.set(key, { name: key, count: 0, revenueCents: 0 });
        itemMap.get(key)!.count += 1;
        itemMap.get(key)!.revenueCents += line.amountCents;
      }
    }
    const salesItems = [...itemMap.values()].sort((a, b) => b.revenueCents - a.revenueCents);

    // ── Payment status ──────────────────────────────────────────────────────
    const paymentStatus = { PAID: 0, OPEN: 0, VOID: 0 } as Record<string, number>;
    for (const b of bookings) {
      if (b.invoice) paymentStatus[b.invoice.status] = (paymentStatus[b.invoice.status] ?? 0) + 1;
    }

    // ── Sales by method ──────────────────────────────────────────────────────
    const methodMap = new Map<string, number>();
    for (const b of paidBookings) {
      for (const p of b.invoice?.payments ?? []) {
        methodMap.set(p.tender, (methodMap.get(p.tender) ?? 0) + p.amountCents);
      }
    }
    const salesByMethod = [...methodMap.entries()].map(([tender, amountCents]) => ({ tender, amountCents })).sort((a, b) => b.amountCents - a.amountCents);

    // ── Bookings breakdown ───────────────────────────────────────────────────
    const bookingsByStatus = this.groupCount(bookings, b => b.status);
    const bookingsBySource = this.groupCount(bookings, b => b.source ?? 'POS');

    // ── Revenue by location (only meaningful when not store-filtered) ─────────
    const locMap = new Map<string, { storeName: string; revenueCents: number; appts: number }>();
    for (const b of bookings) {
      if (!locMap.has(b.storeId)) locMap.set(b.storeId, { storeName: b.store.name, revenueCents: 0, appts: 0 });
      const l = locMap.get(b.storeId)!;
      l.appts += 1;
      if (b.invoice?.status === 'PAID') l.revenueCents += b.invoice.totalCents;
    }
    const revenueByLocation = [...locMap.values()].sort((a, b) => b.revenueCents - a.revenueCents);

    const noShow = bookingsByStatus['NO_SHOW'] ?? 0;
    const cancelled = bookingsByStatus['CANCELLED'] ?? 0;

    return {
      filters: { from: f.from, to: f.to, storeId: f.storeId ?? null, groomerId: f.groomerId ?? null, period },
      summary,
      revenueTrend,
      revenueByStaff: byStaff.map(s => ({ name: s.name, revenueCents: s.revenueCents, appts: s.appts })),
      commissionByStaff: byStaff.map(s => ({ name: s.name, commissionCents: s.commissionCents })),
      tipsByStaff: byStaff.filter(s => s.tipsCents > 0).map(s => ({ name: s.name, tipsCents: s.tipsCents })),
      salesItems,
      paymentStatus,
      salesByMethod,
      bookingsByStatus,
      bookingsBySource,
      revenueByLocation,
      rates: {
        noShowRate: bookings.length ? Math.round(noShow / bookings.length * 100) : 0,
        cancellationRate: bookings.length ? Math.round(cancelled / bookings.length * 100) : 0,
      },
    };
  }

  private bucketKey(d: Date, period: string): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    if (period === 'year') return `${y}`;
    if (period === 'month') return `${y}-${m}`;
    if (period === 'week') {
      const onejan = new Date(Date.UTC(y, 0, 1));
      const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getUTCDay() + 1) / 7);
      return `${y}-W${String(week).padStart(2, '0')}`;
    }
    return `${y}-${m}-${day}`;
  }

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
