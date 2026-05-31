import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface FinanceFilters {
  from: string;
  to: string;
  storeId?: string;
  service?: string; // filter appointment sales by a service/package name
}

export interface SaveExpenseDto {
  storeId: string;
  category: string;
  description?: string;
  amountCents: number;
  incurredAt?: string;
  supplierId?: string | null;
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Sales & Expense report ─────────────────────────────────────────────────

  async report(f: FinanceFilters) {
    const from = new Date(f.from + 'T00:00:00Z');
    const to = new Date(f.to + 'T23:59:59Z');

    const [invoices, expenses] = await Promise.all([
      this.prisma.db.invoice.findMany({
        where: { status: 'PAID', createdAt: { gte: from, lte: to }, ...(f.storeId ? { storeId: f.storeId } : {}) },
        include: { lines: true, booking: { select: { id: true, scheduledStart: true, customer: { select: { fullName: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.expense.findMany({
        where: { incurredAt: { gte: from, lte: to }, ...(f.storeId ? { storeId: f.storeId } : {}) },
        orderBy: { incurredAt: 'desc' },
      }),
    ]);

    // Split sales into appointment (service) vs retail
    let appointmentSalesCents = 0;
    let retailSalesCents = 0;
    const serviceTotals = new Map<string, { name: string; count: number; revenueCents: number }>();
    const appointmentRows: { id: string; date: Date; customer: string; serviceCents: number; retailCents: number }[] = [];

    for (const inv of invoices) {
      let svc = 0, retail = 0;
      for (const line of inv.lines) {
        const baseName = line.description.split(' — ')[0].replace(/ ×\d+ \(retail\)$/, '').replace(/ \(retail\)$/, '');
        if (line.isRetail) {
          retail += line.amountCents;
        } else {
          // Optional service filter
          if (f.service && !baseName.toLowerCase().includes(f.service.toLowerCase())) continue;
          svc += line.amountCents;
          if (!serviceTotals.has(baseName)) serviceTotals.set(baseName, { name: baseName, count: 0, revenueCents: 0 });
          const s = serviceTotals.get(baseName)!;
          s.count += 1; s.revenueCents += line.amountCents;
        }
      }
      appointmentSalesCents += svc;
      retailSalesCents += retail;
      if (svc > 0 || retail > 0) {
        appointmentRows.push({
          id: inv.booking?.id ?? inv.id, date: inv.createdAt,
          customer: inv.booking?.customer.fullName ?? '—',
          serviceCents: svc, retailCents: retail,
        });
      }
    }

    const expensesCents = expenses.reduce((s, e) => s + e.amountCents, 0);
    const expenseByCategory = new Map<string, number>();
    for (const e of expenses) expenseByCategory.set(e.category, (expenseByCategory.get(e.category) ?? 0) + e.amountCents);

    return {
      summary: {
        appointmentSalesCents,
        retailSalesCents,
        totalSalesCents: appointmentSalesCents + retailSalesCents,
        expensesCents,
        netCents: appointmentSalesCents + retailSalesCents - expensesCents,
      },
      servicesBreakdown: [...serviceTotals.values()].sort((a, b) => b.revenueCents - a.revenueCents),
      expenseByCategory: [...expenseByCategory.entries()].map(([category, amountCents]) => ({ category, amountCents })).sort((a, b) => b.amountCents - a.amountCents),
      appointments: appointmentRows.slice(0, 100),
      expenses: expenses.map(e => ({ id: e.id, category: e.category, description: e.description, amountCents: e.amountCents, incurredAt: e.incurredAt })),
    };
  }

  /** Distinct service names for the filter dropdown. */
  async serviceNames() {
    const items = await this.prisma.db.catalogItem.findMany({ where: { active: true, kind: { in: ['PACKAGE', 'ADDON'] } }, select: { name: true }, orderBy: { name: 'asc' } });
    return items.map(i => i.name);
  }

  // ── Expenses CRUD ──────────────────────────────────────────────────────────

  listExpenses(storeId?: string) {
    return this.prisma.db.expense.findMany({
      where: storeId ? { storeId } : {},
      orderBy: { incurredAt: 'desc' }, take: 200,
    });
  }

  async createExpense(dto: SaveExpenseDto, tenantId: string, userId: string) {
    const e = await this.prisma.db.expense.create({
      data: {
        tenantId, storeId: dto.storeId, category: dto.category, description: dto.description,
        amountCents: dto.amountCents, incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : new Date(),
        supplierId: dto.supplierId ?? null, createdBy: userId,
      },
    });
    await this.audit.log({ action: 'EXPENSE_CREATE', entityType: 'expense', entityId: e.id, metadata: { amountCents: dto.amountCents } });
    return e;
  }

  async deleteExpense(id: string) {
    await this.prisma.db.expense.delete({ where: { id } });
    await this.audit.log({ action: 'EXPENSE_DELETE', entityType: 'expense', entityId: id });
  }
}
