import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TimeclockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Clock in / out ────────────────────────────────────────────────────────

  async clockIn(userId: string, storeId: string, tenantId: string) {
    // Guard: already clocked in
    const open = await this.prisma.db.timeclockEntry.findFirst({
      where: { userId, storeId, clockOut: null },
    });
    if (open) throw new BadRequestException('Already clocked in. Please clock out first.');

    const entry = await this.prisma.db.timeclockEntry.create({
      data: { tenantId, storeId, userId, clockIn: new Date() },
    });
    await this.audit.log({ action: 'CLOCK_IN', entityType: 'timeclock_entry', entityId: entry.id });
    return entry;
  }

  async clockOut(userId: string, storeId: string) {
    const open = await this.prisma.db.timeclockEntry.findFirst({
      where: { userId, storeId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });
    if (!open) throw new BadRequestException('Not currently clocked in.');

    const entry = await this.prisma.db.timeclockEntry.update({
      where: { id: open.id },
      data: { clockOut: new Date() },
    });
    await this.audit.log({ action: 'CLOCK_OUT', entityType: 'timeclock_entry', entityId: entry.id });
    return entry;
  }

  /** Current clock-in status for a user. */
  async status(userId: string, storeId: string) {
    const open = await this.prisma.db.timeclockEntry.findFirst({
      where: { userId, storeId, clockOut: null },
    });
    return { clockedIn: !!open, since: open?.clockIn ?? null, entryId: open?.id ?? null };
  }

  // ── History & reports ─────────────────────────────────────────────────────

  async history(storeId: string, userId?: string, from?: string, to?: string) {
    const where: Record<string, unknown> = { storeId };
    if (userId) where['userId'] = userId;
    if (from || to) {
      where['clockIn'] = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    return this.prisma.db.timeclockEntry.findMany({
      where,
      orderBy: { clockIn: 'desc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  /**
   * Hours report per employee for a date range.
   * Spec §12: "surfaces hours worked per employee and automatically flags
   * incomplete entries before feeding directly into payroll processing."
   */
  async hoursReport(storeId: string, from: string, to: string) {
    const entries = await this.history(storeId, undefined, from, to);

    const byUser = new Map<string, { userId: string; fullName: string; totalMinutes: number; incompleteCount: number; entries: typeof entries }>();

    for (const e of entries) {
      const key = e.userId;
      if (!byUser.has(key)) {
        byUser.set(key, {
          userId: e.userId,
          fullName: (e.user as { fullName: string }).fullName,
          totalMinutes: 0,
          incompleteCount: 0,
          entries: [],
        });
      }
      const record = byUser.get(key)!;
      record.entries.push(e);
      if (e.clockOut) {
        record.totalMinutes += Math.round(
          (e.clockOut.getTime() - e.clockIn.getTime()) / 60_000,
        );
      } else {
        record.incompleteCount += 1;
      }
    }

    return Array.from(byUser.values()).map(r => ({
      ...r,
      totalHours: +(r.totalMinutes / 60).toFixed(2),
      hasIncomplete: r.incompleteCount > 0,
    }));
  }

  /**
   * Manager manual time punch (spec §8.3C): mandatory note, strict End > Start.
   */
  async manualPunch(
    dto: { userId: string; storeId: string; date: string; clockIn: string; clockOut: string; notes: string },
    tenantId: string,
  ) {
    if (!dto.notes?.trim()) throw new BadRequestException('A note is required for manual time entries.');
    const clockIn = new Date(`${dto.date}T${dto.clockIn}:00`);
    const clockOut = new Date(`${dto.date}T${dto.clockOut}:00`);
    if (isNaN(clockIn.getTime()) || isNaN(clockOut.getTime())) throw new BadRequestException('Invalid date or time.');
    if (clockOut <= clockIn) throw new BadRequestException('End time must be after start time.');

    const entry = await this.prisma.db.timeclockEntry.create({
      data: { tenantId, storeId: dto.storeId, userId: dto.userId, clockIn, clockOut, notes: dto.notes.trim() },
    });
    await this.audit.log({ action: 'TIMECLOCK_MANUAL', entityType: 'timeclock_entry', entityId: entry.id, metadata: { userId: dto.userId } });
    return entry;
  }

  /** CSV of the per-employee hours report for a pay period (spec §8.3B Export). */
  async exportCsv(storeId: string, from: string, to: string): Promise<string> {
    const report = await this.hoursReport(storeId, from, to);
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Staff', 'Total Hours', 'Incomplete Entries'];
    const rows = report.map(r => [esc(r.fullName), r.totalHours, r.incompleteCount].join(','));
    return [header.join(','), ...rows].join('\n');
  }

  /** Flag all open (incomplete) entries from previous days. */
  async flagIncompleteEntries() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const result = await this.prisma.db.timeclockEntry.updateMany({
      where: { clockOut: null, clockIn: { lt: yesterday } },
      data: { incomplete: true },
    });
    return { flagged: result.count };
  }
}
