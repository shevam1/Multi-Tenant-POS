import { Injectable } from '@nestjs/common';
import type { AutomationType, MessageChannel } from '@omnipos/db';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from './messaging.service';
import {
  AUTOMATION_TYPES, TYPE_META, renderTemplate, type DeliveryMode, type MergeContext,
} from './automation.meta';

export interface SaveRuleDto {
  type: AutomationType;
  deliveryMode?: DeliveryMode;
  channel?: MessageChannel;
  enabled: boolean;
  offsetHours: number;
  template: string;
  subject?: string | null;
  brandColor?: string | null;
  ccEmails?: string[];
}

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  // ── Automation rules ──────────────────────────────────────────────────────

  /** Surface all automation types — stored config merged over per-type defaults. */
  async listRules(tenantId: string) {
    const existing = await this.prisma.db.automationRule.findMany();
    const byType = new Map(existing.map(r => [r.type, r]));
    return AUTOMATION_TYPES.map(type => {
      const meta = TYPE_META[type];
      const r = byType.get(type);
      return {
        id: r?.id ?? null,
        type,
        label: meta.label,
        group: meta.group,
        timing: meta.timing,
        deliveryMode: (r?.deliveryMode as DeliveryMode) ?? meta.deliveryMode,
        enabled: r ? r.enabled : meta.enabled,
        offsetHours: r?.offsetHours ?? meta.offsetHours,
        template: r?.template ?? meta.template,
        subject: r?.subject ?? meta.subject,
        brandColor: r?.brandColor ?? null,
        ccEmails: r?.ccEmails ?? [],
      };
    });
  }

  async saveRule(tenantId: string, dto: SaveRuleDto) {
    const mode = dto.deliveryMode ?? 'SMS';
    // Keep the legacy `channel` column coherent with the delivery mode.
    const channel: MessageChannel = mode === 'EMAIL' ? 'EMAIL' : 'SMS';
    const data = {
      deliveryMode: mode,
      channel,
      enabled: dto.enabled,
      offsetHours: dto.offsetHours,
      template: dto.template,
      subject: dto.subject ?? null,
      brandColor: dto.brandColor ?? null,
      ccEmails: dto.ccEmails ?? [],
    };
    const existing = await this.prisma.db.automationRule.findFirst({ where: { type: dto.type } });
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

  /** Build the merge-tag context for a booking from related records + settings. */
  private async buildContext(bookingId: string): Promise<{ ctx: MergeContext; phone: string | null; email: string | null }> {
    const booking = await this.prisma.db.booking.findUnique({
      where: { id: bookingId },
      include: {
        customer: { select: { fullName: true, phone: true, email: true, addressLine: true, city: true, postalCode: true } },
        pet: { select: { name: true } },
        store: { select: { name: true, addressLine: true, city: true } },
        groomers: { include: { user: { select: { fullName: true } } } },
        lineItems: { select: { description: true } },
        invoice: { select: { id: true, totalCents: true } },
      },
    });
    if (!booking) throw new Error('Booking not found');

    const settings = await this.prisma.db.tenantSettings.findFirst();
    const [firstName, ...rest] = booking.customer.fullName.split(' ');
    const start = booking.scheduledStart;
    const end = booking.scheduledEnd ?? new Date(start.getTime() + 60 * 60000);
    const dateOpt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const timeOpt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    const startStr = start.toLocaleTimeString('en-CA', timeOpt);
    const endStr = end.toLocaleTimeString('en-CA', timeOpt);
    const balanceCents = booking.invoice?.totalCents ?? 0;

    const ctx: MergeContext = {
      first_name: firstName,
      last_name: rest.join(' '),
      pets: booking.pet?.name ?? 'your pet',
      business_name: settings?.businessName || booking.store.name,
      business_address: settings?.addressLine || [booking.store.addressLine, booking.store.city].filter(Boolean).join(', '),
      business_phone: settings?.phone || '',
      client_address: [booking.customer.addressLine, booking.customer.city, booking.customer.postalCode].filter(Boolean).join(', '),
      appointment_date: start.toLocaleDateString('en-CA', dateOpt),
      appointment_start_time: startStr,
      appointment_end_time: endStr,
      appointment_time_with_arrival_window: `${startStr}–${endStr}`,
      day_of_week: start.toLocaleDateString('en-CA', { weekday: 'long' }),
      services: booking.lineItems.map(l => l.description).filter(Boolean).join(', '),
      groomer: booking.groomers.map(g => g.user.fullName).join(', '),
      balance: `$${(balanceCents / 100).toFixed(2)}`,
      bill_link: booking.invoice ? `https://pay.omnipos.app/i/${booking.invoice.id}` : '',
      invoice_link: booking.invoice ? `https://pay.omnipos.app/i/${booking.invoice.id}` : '',
    };
    return { ctx, phone: booking.customer.phone, email: booking.customer.email };
  }

  /** Send/resend a reminder for a booking using the configured rule + merge tags. */
  async sendReminder(bookingId: string, type: AutomationType, tenantId: string) {
    const meta = TYPE_META[type];
    const rule = await this.prisma.db.automationRule.findFirst({ where: { type } });
    const mode = (rule?.deliveryMode as DeliveryMode) ?? meta.deliveryMode;
    const template = rule?.template ?? meta.template;
    const subjectTpl = rule?.subject ?? meta.subject;
    const cc = (rule?.ccEmails ?? []).join(',') || undefined;

    const { ctx, phone, email } = await this.buildContext(bookingId);
    const body = renderTemplate(template, ctx);
    const subject = renderTemplate(subjectTpl, ctx);

    const results: { channel: MessageChannel; ok: boolean; provider: string }[] = [];
    if (mode === 'SMS' || mode === 'BOTH') {
      const r = await this.messaging.sendSMS(phone, body);
      results.push({ channel: 'SMS', ok: r.ok, provider: r.provider });
    }
    if (mode === 'EMAIL' || mode === 'BOTH') {
      const r = await this.messaging.sendEmail(email, subject, body, cc ? { cc } : undefined);
      results.push({ channel: 'EMAIL', ok: r.ok, provider: r.provider });
    }

    const ok = results.some(r => r.ok);
    const logChannel: MessageChannel = mode === 'EMAIL' ? 'EMAIL' : 'SMS';
    await this.prisma.db.reminderLog.upsert({
      where: { bookingId_type: { bookingId, type } },
      update: { status: ok ? 'SENT' : 'FAILED', sentAt: new Date(), channel: logChannel },
      create: { tenantId, bookingId, type, channel: logChannel, status: ok ? 'SENT' : 'FAILED' },
    });
    return { ok, channels: results, body, subject };
  }
}
