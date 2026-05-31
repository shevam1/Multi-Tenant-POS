import { Injectable, Logger } from '@nestjs/common';

export interface SendResult {
  ok: boolean;
  provider: 'twilio' | 'sendgrid' | 'console';
  detail?: string;
}

/**
 * Outbound SMS/Email adapter.
 *
 * Sends via Twilio / SendGrid when credentials are configured; otherwise logs
 * to the console (dev/demo) and reports success. The rest of the app calls
 * sendSMS / sendEmail without caring which path is active — flipping to live
 * delivery is purely env configuration.
 *
 * CASL note: consent gating happens in MessagesService before this is called.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  get smsEnabled(): boolean {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
  }
  get emailEnabled(): boolean {
    return !!process.env.SENDGRID_API_KEY;
  }

  async sendSMS(to: string | null, body: string): Promise<SendResult> {
    if (!to) return { ok: false, provider: 'console', detail: 'No phone on file' };
    if (this.smsEnabled) {
      try {
        const sid = process.env.TWILIO_ACCOUNT_SID!;
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
        });
        return { ok: res.ok, provider: 'twilio', detail: res.ok ? undefined : await res.text() };
      } catch (e) {
        return { ok: false, provider: 'twilio', detail: (e as Error).message };
      }
    }
    this.logger.log(`📱 [SMS→${to}] ${body}`);
    return { ok: true, provider: 'console' };
  }

  async sendEmail(to: string | null, subject: string, body: string, opts?: { cc?: string; bcc?: string }): Promise<SendResult> {
    if (!to) return { ok: false, provider: 'console', detail: 'No email on file' };
    if (this.emailEnabled) {
      try {
        const personalization: Record<string, unknown> = { to: [{ email: to }] };
        if (opts?.cc) personalization.cc = opts.cc.split(',').map(e => ({ email: e.trim() })).filter(e => e.email);
        if (opts?.bcc) personalization.bcc = opts.bcc.split(',').map(e => ({ email: e.trim() })).filter(e => e.email);
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            personalizations: [personalization],
            from: { email: process.env.SENDGRID_FROM ?? 'noreply@omnipos.dev' },
            subject,
            content: [{ type: 'text/plain', value: body }],
          }),
        });
        return { ok: res.ok, provider: 'sendgrid', detail: res.ok ? undefined : await res.text() };
      } catch (e) {
        return { ok: false, provider: 'sendgrid', detail: (e as Error).message };
      }
    }
    this.logger.log(`✉️  [EMAIL→${to}${opts?.cc ? ` cc:${opts.cc}` : ''}${opts?.bcc ? ` bcc:${opts.bcc}` : ''}] ${subject}: ${body}`);
    return { ok: true, provider: 'console' };
  }
}
