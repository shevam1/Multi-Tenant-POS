import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VaccinationsService } from './vaccinations.service';

/**
 * Daily cron job that implements spec §3:
 *   "generates automated client reminders when a vaccine is expiring"
 *
 * Runs at 09:00 every day. Scans for vaccinations expiring in 30, 14, or 7
 * days and logs the alert (console adapter). Swap for Twilio/SendGrid by
 * injecting a MessagingService once the live adapter is configured.
 */
@Injectable()
export class VaccinationAlertsJob {
  private readonly logger = new Logger(VaccinationAlertsJob.name);

  constructor(private readonly vaccinations: VaccinationsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendExpiryAlerts() {
    this.logger.log('Running vaccination expiry alert scan…');

    for (const threshold of [30, 14, 7]) {
      const records = await this.vaccinations.findExpiringAcrossAllTenants(threshold);

      // Filter to only those exactly on this threshold (±1 day window)
      const lowerBound = threshold - 1;
      const filtered = records.filter(r => {
        if (!r.expiresAt) return false;
        const daysLeft = Math.ceil((r.expiresAt.getTime() - Date.now()) / 86_400_000);
        return daysLeft === threshold || (threshold === 30 && daysLeft >= 28 && daysLeft <= 30);
      });

      for (const record of filtered) {
        const owner = record.pet.customer;
        const petName = record.pet.name;
        const daysLeft = Math.ceil((record.expiresAt!.getTime() - Date.now()) / 86_400_000);
        const message =
          `Hi ${owner.fullName}, this is a reminder that ${petName}'s ` +
          `${record.vaccineType} vaccination expires in ${daysLeft} day(s) ` +
          `(${record.expiresAt!.toLocaleDateString('en-CA')}). ` +
          `Please contact your vet to renew before booking.`;

        // Console adapter — replace with: await this.messaging.sendSMS(owner.phone, message)
        this.logger.log(
          `[VACCINATION ALERT] → ${owner.phone ?? owner.email ?? 'no contact'} | ${message}`,
        );
      }

      if (filtered.length > 0) {
        this.logger.log(`Sent ${filtered.length} alerts for ${threshold}-day threshold`);
      }
    }

    this.logger.log('Vaccination expiry scan complete');
  }

  /** Manually trigger for testing — exposed via API in non-production. */
  async triggerNow() {
    await this.sendExpiryAlerts();
  }
}
