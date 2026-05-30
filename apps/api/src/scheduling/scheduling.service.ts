import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ShiftStatus, LeaveStatus } from '@omnipos/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface CreateShiftDto {
  userId: string;
  storeId: string;
  startsAt: string;
  endsAt: string;
  role?: string;
  notes?: string;
}

export interface UpdateShiftDto {
  startsAt?: string;
  endsAt?: string;
  role?: string;
  status?: ShiftStatus;
  notes?: string;
}

export interface CreateLeaveDto {
  storeId: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
}

@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Staff ─────────────────────────────────────────────────────────────────

  /** List active staff users for a store (for assigning shifts). */
  async listStaff(storeId: string) {
    return this.prisma.db.user.findMany({
      where: { storeId, active: true },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  // ── Shifts ────────────────────────────────────────────────────────────────

  async listShifts(storeId: string, weekStart?: string) {
    const where: Record<string, unknown> = { storeId };
    if (weekStart) {
      const start = new Date(weekStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      where['startsAt'] = { gte: start, lt: end };
    }
    return this.prisma.db.shiftSchedule.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: { user: { select: { id: true, fullName: true, role: true } } },
    });
  }

  async createShift(dto: CreateShiftDto, tenantId: string) {
    const starts = new Date(dto.startsAt);
    const ends = new Date(dto.endsAt);
    if (ends <= starts) throw new BadRequestException('Shift end must be after start');

    // Guard: check for existing shift overlap for the same user
    const overlap = await this.prisma.db.shiftSchedule.findFirst({
      where: {
        userId: dto.userId,
        storeId: dto.storeId,
        status: { not: 'CANCELLED' },
        OR: [
          { startsAt: { lt: ends }, endsAt: { gt: starts } },
        ],
      },
    });
    if (overlap) {
      throw new BadRequestException(
        `Shift overlaps with an existing shift from ${overlap.startsAt.toISOString()} to ${overlap.endsAt?.toISOString()}`,
      );
    }

    const shift = await this.prisma.db.shiftSchedule.create({
      data: {
        tenantId,
        storeId: dto.storeId,
        userId: dto.userId,
        startsAt: starts,
        endsAt: ends,
        role: dto.role,
        notes: dto.notes,
      },
      include: { user: { select: { id: true, fullName: true, role: true } } },
    });
    await this.audit.log({ action: 'SHIFT_CREATE', entityType: 'shift_schedule', entityId: shift.id });
    return shift;
  }

  async updateShift(id: string, dto: UpdateShiftDto) {
    const shift = await this.prisma.db.shiftSchedule.update({
      where: { id },
      data: {
        ...(dto.startsAt && { startsAt: new Date(dto.startsAt) }),
        ...(dto.endsAt && { endsAt: new Date(dto.endsAt) }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.status && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    await this.audit.log({ action: 'SHIFT_UPDATE', entityType: 'shift_schedule', entityId: id });
    return shift;
  }

  async deleteShift(id: string) {
    await this.prisma.db.shiftSchedule.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({ action: 'SHIFT_CANCEL', entityType: 'shift_schedule', entityId: id });
  }

  // ── Leave requests ────────────────────────────────────────────────────────

  async listLeave(storeId: string) {
    return this.prisma.db.leaveRequest.findMany({
      where: { storeId },
      orderBy: { startsAt: 'asc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async createLeave(userId: string, dto: CreateLeaveDto, tenantId: string) {
    const leave = await this.prisma.db.leaveRequest.create({
      data: {
        tenantId,
        storeId: dto.storeId,
        userId,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        reason: dto.reason,
      },
    });
    return leave;
  }

  async reviewLeave(id: string, status: LeaveStatus, reviewerId: string) {
    return this.prisma.db.leaveRequest.update({
      where: { id },
      data: { status, reviewedBy: reviewerId },
    });
  }

  // ── Roster helpers ────────────────────────────────────────────────────────

  /** Returns staff schedule grouped by user for the current week. */
  async weeklyRoster(storeId: string, weekStart: string) {
    const shifts = await this.listShifts(storeId, weekStart);
    const byUser = new Map<string, { user: { id: string; fullName: string; role: string }; shifts: typeof shifts }>();
    for (const shift of shifts) {
      const key = shift.userId;
      if (!byUser.has(key)) byUser.set(key, { user: shift.user as { id: string; fullName: string; role: string }, shifts: [] });
      byUser.get(key)!.shifts.push(shift);
    }
    return Array.from(byUser.values());
  }
}
