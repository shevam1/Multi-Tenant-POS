import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MessagingService } from './messaging.service';

/** Cap: at most one automated reply per unique phone number per hour. */
const ANTI_LOOP_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class SmsAutoReplyService {
  private readonly logger = new Logger(SmsAutoReplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  /** Default placeholder used when enabled but no message is configured. */
  private fallback(businessName: string) {
    return `Thank you for messaging ${businessName || 'us'}. We will review your message shortly.`;
  }

  async getConfig(tenantId: string) {
    let s = await this.prisma.db.tenantSettings.findUnique({ where: { tenantId } });
    if (!s) s = await this.prisma.db.tenantSettings.create({ data: { tenantId } });
    return {
      enabled: s.smsAutoReplyEnabled,
      message: s.smsAutoReplyMessage ?? '',
      businessName: s.businessName ?? '',
    };
  }

  async saveConfig(tenantId: string, dto: { enabled: boolean; message?: string | null }) {
    await this.getConfig(tenantId); // ensure row exists
    const s = await this.prisma.db.tenantSettings.update({
      where: { tenantId },
      data: { smsAutoReplyEnabled: dto.enabled, smsAutoReplyMessage: dto.message ?? null },
    });
    await this.audit.log({ action: 'SMS_AUTOREPLY_UPDATE', entityType: 'tenant_settings', entityId: s.id, metadata: { enabled: dto.enabled } });
    return { enabled: s.smsAutoReplyEnabled, message: s.smsAutoReplyMessage ?? '' };
  }

  /**
   * Telephony gateway entry point: an inbound SMS arrived on the business line.
   * Returns whether an automated reply was dispatched and why.
   */
  async processInbound(tenantId: string, fromPhone: string): Promise<{ replied: boolean; reason: string; body?: string }> {
    const cfg = await this.getConfig(tenantId);
    if (!cfg.enabled) return { replied: false, reason: 'disabled' };

    // Anti-loop guardrail: skip if we already auto-replied to this number within the window.
    const since = new Date(Date.now() - ANTI_LOOP_WINDOW_MS);
    const recent = await this.prisma.db.smsAutoReplyLog.findFirst({
      where: { phone: fromPhone, sentAt: { gte: since } },
      select: { id: true },
    });
    if (recent) return { replied: false, reason: 'rate-limited (1/hour per number)' };

    const body = cfg.message?.trim() || this.fallback(cfg.businessName);
    const res = await this.messaging.sendSMS(fromPhone, body);
    await this.prisma.db.smsAutoReplyLog.create({ data: { tenantId, phone: fromPhone } });
    this.logger.log(`Auto-reply → ${fromPhone} via ${res.provider}`);
    return { replied: res.ok, reason: res.ok ? 'sent' : `send-failed: ${res.detail ?? ''}`, body };
  }
}
