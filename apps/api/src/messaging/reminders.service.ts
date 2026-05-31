import { Injectable } from '@nestjs/common';
import type { AutomationType, MessageChannel } from '@omnipos/db';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from './messaging.service';

const DEFAULT_TEMPLATES: Record<AutomationType, string> = {
  APPOINTMENT_REMINDER: 'Hi {{customerName}}, reminder: {{petName}}’s appointment is on {{time}}. Reply YES to confirm.',
  SECONDARY_REMINDER: 'Reminder: {{petName}}’s grooming is coming up on {{time}}. See you soon!',
  SAME_DAY_REMINDER: 'See you today! {{petName}}’s appointment is at {{time}}.',
  REBOOK_REMINDER: 'Hi {{customerName}}, it’s been a while since {{petName}}’s last groom. Ready to rebook?',
  VACCINATION_REMINDER: '{{petName}}’s vaccination is expiring soon. Please bring updated records.',
  PET_BIRTHDAY_REMINDER: '🎉 Happy birthday {{petName}}! Enjoy a treat on us at your next visit.',
};

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  // ── Automation rules ──────────────────────────────────────────────────────

  async listRules(tenantId: string) {
    const existing = await this.prisma.db.automationRule.findMany();
    const byType = new Map(existing.map(r => [r.type, r]));
    // Surface all 6 types, defaulting any not yet configured
    return (Object.keys(DEFAULT_TEMPLATES) as AutomationType[]).map(type => {
      const r = byType.get(type);
      return r ?? {
        id: null, tenantId, type, channel: 'SMS' as MessageChannel, enabled: type === 'APPOINTMENT_REMINDER',
        offsetHours: type === 'SAME_DAY_REMINDER' ? 2 : 24, template: DEFAULT_TEMPLATES[type],
      };
    });
  }

  async saveRule(tenantId: string, dto: { type: AutomationType; channel: MessageChannel; enabled: boolean; offsetHours: number; template: string }) {
    const existing = await this.prisma.db.automationRule.findFirst({ where: { type: dto.type } });
    const data = { channel: dto.channel, enabled: dto.enabled, offsetHours: dto.offsetHours, template: dto.template };
    return existing
      ? this.prisma.db.automationRule.update({ where: { id: existing.id }, data })
      : this.prisma.db.automationRule.create({ data: { tenantId, type: dto.type, ...data } });
  }

  // ── Reminders table (per type) ──────────────────────────────────────────────

  /**
   * Rows for the Reminders UI: upcoming bookings + their reminder status for the
   * given reminder type. Status comes from the booking status + reminder log.
   */
  async remindersForType(type: AutomationType, storeId?: string) {
    const now = new Date();
    const horizon = new Date(now.getTime() + 14 * 86400000); // next 2 weeks

    const bookings = await this.prisma.db.booking.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        scheduledStart: { gte: now, lte: horizon },
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 100,
      include: { customer: { select: { id: true, fullName: true } } },
    });

    const logs = await this.prisma.db.reminderLog.findMany({ where: { type, bookingId: { in: bookings.map(b => b.id) } } });
    const logByBooking = new Map(logs.map(l => [l.bookingId, l]));

    return bookings.map(b => ({
      bookingId: b.id,
      shortId: b.id.slice(-7),
      status: b.status,                  // appointment status
      scheduledStart: b.scheduledStart,
      client: b.customer.fullName,
      customerId: b.customer.id,
      reminderStatus: b.status === 'CONFIRMED' ? 'Confirmed' : (logByBooking.has(b.id) ? 'Sent' : 'Pending'),
      canResend: b.status !== 'CONFIRMED',
    }));
  }

  /** Send/resend a reminder for a booking. */
  async sendReminder(bookingId: string, type: AutomationType, tenantId: string) {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id: bookingId },
      include: { customer: { select: { id: true, fullName: true, phone: true, email: true } }, pet: { select: { name: true } } },
    });
    if (!booking) throw new Error('Booking not found');

    const rule = await this.prisma.db.automationRule.findFirst({ where: { type } });
    const template = rule?.template ?? DEFAULT_TEMPLATES[type];
    const channel = rule?.channel ?? 'SMS';
    const body = template
      .replace(/\{\{customerName\}\}/g, booking.customer.fullName)
      .replace(/\{\{petName\}\}/g, booking.pet?.name ?? 'your pet')
      .replace(/\{\{time\}\}/g, new Date(booking.scheduledStart).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }));

    const result = channel === 'EMAIL'
      ? await this.messaging.sendEmail(booking.customer.email, 'Appointment reminder', body)
      : await this.messaging.sendSMS(booking.customer.phone, body);

    await this.prisma.db.reminderLog.upsert({
      where: { bookingId_type: { bookingId, type } },
      update: { status: result.ok ? 'SENT' : 'FAILED', sentAt: new Date(), channel },
      create: { tenantId, bookingId, type, channel, status: result.ok ? 'SENT' : 'FAILED' },
    });
    return { ok: result.ok, provider: result.provider, body };
  }
}
