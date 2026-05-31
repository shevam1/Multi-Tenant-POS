import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { AutomationType } from '@omnipos/db';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from './reminders.service';

/**
 * Hourly automation: for each enabled rule, dispatch reminders to bookings whose
 * start falls within the rule's offset window and haven't been reminded yet.
 * Runs across all tenants (system scope).
 */
@Injectable()
export class RemindersJob {
  private readonly logger = new Logger(RemindersJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminders: RemindersService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async dispatchDue() {
    const now = new Date();
    const rules = await this.prisma.asSystem(tx =>
      tx.automationRule.findMany({ where: { enabled: true, type: { in: ['APPOINTMENT_REMINDER', 'SECONDARY_REMINDER', 'SAME_DAY_REMINDER'] } } }),
    );
    if (rules.length === 0) return;

    let sent = 0;
    for (const rule of rules) {
      const windowEnd = new Date(now.getTime() + rule.offsetHours * 3600_000);
      // Bookings starting within [now, now+offset] that are confirmed/pending and not yet reminded for this type
      const bookings = await this.prisma.asSystem(async tx => {
        const candidates = await tx.booking.findMany({
          where: {
            tenantId: rule.tenantId,
            scheduledStart: { gte: now, lte: windowEnd },
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
          select: { id: true },
          take: 200,
        });
        const logged = await tx.reminderLog.findMany({
          where: { type: rule.type as AutomationType, bookingId: { in: candidates.map(c => c.id) } },
          select: { bookingId: true },
        });
        const loggedSet = new Set(logged.map(l => l.bookingId));
        return candidates.filter(c => !loggedSet.has(c.id));
      });

      for (const b of bookings) {
        await this.reminders.sendReminder(b.id, rule.type as AutomationType, rule.tenantId).catch(() => null);
        sent++;
      }
    }
    if (sent > 0) this.logger.log(`Automation dispatched ${sent} reminder(s)`);
  }
}
