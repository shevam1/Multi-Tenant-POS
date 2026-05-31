import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const DEFAULT_OPEN = 480;   // 08:00
const DEFAULT_CLOSE = 1140; // 19:00

export interface StoreHourRow { weekday: number; isOpen: boolean; openMin: number; closeMin: number }

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Tenant settings (singleton, auto-created) ──────────────────────────────

  async get(tenantId: string) {
    let s = await this.prisma.db.tenantSettings.findUnique({ where: { tenantId } });
    if (!s) s = await this.prisma.db.tenantSettings.create({ data: { tenantId } });
    return s;
  }

  async update(tenantId: string, dto: Record<string, unknown>) {
    await this.get(tenantId); // ensure exists
    const allowed = [
      'businessName', 'logoUrl', 'phone', 'website', 'addressLine', 'businessType',
      'currency', 'dateFormat', 'weightUnit', 'multiCouponMode', 'upcomingApptCount',
      'serviceFrequencyValue', 'serviceFrequencyUnit',
      'socialEmail', 'socialFacebook', 'socialGoogle', 'socialYelp',
      'allowDoubleBooking', 'largeDogWeightKg', 'scheduleIntervalMin',
    ];
    const data: Record<string, unknown> = {};
    for (const k of allowed) if (dto[k] !== undefined) data[k] = dto[k];
    const s = await this.prisma.db.tenantSettings.update({ where: { tenantId }, data });
    await this.audit.log({ action: 'SETTINGS_UPDATE', entityType: 'tenant_settings', entityId: s.id, metadata: { keys: Object.keys(data) } });
    return s;
  }

  /** Settings for the booking/availability engines (tenantId explicit for public flows). */
  async forEngine(tenantId?: string) {
    const db = tenantId ? this.prisma.forTenant(tenantId) : this.prisma.db;
    const s = tenantId
      ? await db.tenantSettings.findUnique({ where: { tenantId } })
      : await db.tenantSettings.findFirst();
    return {
      allowDoubleBooking: s?.allowDoubleBooking ?? false,
      largeDogWeightKg: s?.largeDogWeightKg ?? 30,
      scheduleIntervalMin: s?.scheduleIntervalMin ?? 60,
    };
  }

  // ── Store hours ────────────────────────────────────────────────────────────

  /** Returns 7 rows (Sun..Sat), defaulting any missing day to 08:00–19:00 open. */
  async getHours(storeId: string, tenantId?: string) {
    const db = tenantId ? this.prisma.forTenant(tenantId) : this.prisma.db;
    const rows = await db.storeHours.findMany({ where: { storeId } });
    const byDay = new Map(rows.map(r => [r.weekday, r]));
    return Array.from({ length: 7 }, (_, weekday) => {
      const r = byDay.get(weekday);
      return {
        weekday,
        isOpen: r ? r.isOpen : weekday !== 0,            // closed Sundays by default
        openMin: r?.openMin ?? DEFAULT_OPEN,
        closeMin: r?.closeMin ?? DEFAULT_CLOSE,
      };
    });
  }

  async setHours(storeId: string, hours: StoreHourRow[], tenantId: string) {
    await this.prisma.db.$transaction(
      hours.map(h =>
        this.prisma.db.storeHours.upsert({
          where: { storeId_weekday: { storeId, weekday: h.weekday } },
          update: { isOpen: h.isOpen, openMin: h.openMin, closeMin: h.closeMin },
          create: { tenantId, storeId, weekday: h.weekday, isOpen: h.isOpen, openMin: h.openMin, closeMin: h.closeMin },
        }),
      ),
    );
    await this.audit.log({ action: 'STORE_HOURS_UPDATE', entityType: 'store', entityId: storeId });
    return this.getHours(storeId);
  }
}
