import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MessageChannel } from '@omnipos/db';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from './messaging.service';

export interface SendMessageDto {
  channel: MessageChannel;
  body: string;
  subject?: string;
  cc?: string;
  bcc?: string;
  attachments?: string[];
  scheduledFor?: string | null;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  // ── Threads ──────────────────────────────────────────────────────────────

  async listThreads(filter?: string) {
    const where: Record<string, unknown> = {};
    if (filter === 'open') where['status'] = 'OPEN';
    else if (filter === 'closed') where['status'] = 'CLOSED';
    else if (filter === 'unread') where['unread'] = true;
    else if (filter === 'scheduled') {
      // threads that have a scheduled (future) message
      where['messages'] = { some: { status: 'SCHEDULED' } };
    }

    return this.prisma.db.messageThread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: { customer: { select: { id: true, fullName: true, phone: true, email: true, tags: true } } },
      take: 100,
    });
  }

  /** Get or create the thread for a customer. */
  async getOrCreateThread(customerId: string, tenantId: string) {
    const existing = await this.prisma.db.messageThread.findFirst({ where: { customerId } });
    if (existing) return existing;
    return this.prisma.db.messageThread.create({ data: { tenantId, customerId } });
  }

  async getThread(id: string) {
    const thread = await this.prisma.db.messageThread.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, fullName: true, phone: true, email: true, tags: true, statementCreditCents: true, preferredStoreId: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 200 },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    return thread;
  }

  async markRead(id: string) {
    return this.prisma.db.messageThread.update({ where: { id }, data: { unread: false } });
  }

  async setStatus(id: string, status: 'OPEN' | 'CLOSED') {
    return this.prisma.db.messageThread.update({ where: { id }, data: { status } });
  }

  // ── Sending ──────────────────────────────────────────────────────────────

  /** CASL consent check — has the customer opted out of this channel? */
  private async optedOut(customerId: string, channel: MessageChannel): Promise<boolean> {
    if (channel === 'SYSTEM') return false;
    const c = await this.prisma.db.customer.findUnique({
      where: { id: customerId },
      select: { optOutMarketingSms: true, optOutMarketingEmail: true, blockMessages: true },
    });
    if (!c) return true;
    if (c.blockMessages) return true;
    if (channel === 'SMS') return c.optOutMarketingSms;
    if (channel === 'EMAIL') return c.optOutMarketingEmail;
    return false;
  }

  async sendMessage(threadId: string, dto: SendMessageDto, userId: string, tenantId: string) {
    const thread = await this.prisma.db.messageThread.findUnique({
      where: { id: threadId },
      include: { customer: { select: { id: true, phone: true, email: true } } },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    if (await this.optedOut(thread.customerId, dto.channel)) {
      throw new BadRequestException('Customer has opted out of this channel (CASL) or messaging is blocked');
    }

    const scheduled = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    let status: string = scheduled && scheduled > new Date() ? 'SCHEDULED' : 'SENT';

    // Dispatch now if not scheduled
    if (status === 'SENT' && dto.channel !== 'SYSTEM') {
      const result = dto.channel === 'SMS'
        ? await this.messaging.sendSMS(thread.customer.phone, dto.body)
        : await this.messaging.sendEmail(thread.customer.email, dto.subject ?? 'Message from your groomer', dto.body, { cc: dto.cc, bcc: dto.bcc });
      if (!result.ok) status = 'FAILED';
    }

    const message = await this.prisma.db.message.create({
      data: {
        tenantId, threadId, channel: dto.channel, direction: 'OUTBOUND',
        subject: dto.subject, body: dto.body, attachments: dto.attachments ?? [],
        status: status as 'SENT' | 'SCHEDULED' | 'FAILED', scheduledFor: scheduled, sentByUserId: userId,
      },
    });

    await this.prisma.db.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date(), lastMessagePreview: dto.body.slice(0, 80), status: 'OPEN' },
    });
    return message;
  }

  /** Simulate an inbound message (two-way) — used by webhook / demo. */
  async receiveInbound(customerId: string, body: string, channel: MessageChannel, tenantId: string) {
    const thread = await this.getOrCreateThread(customerId, tenantId);
    const message = await this.prisma.db.message.create({
      data: { tenantId, threadId: thread.id, channel, direction: 'INBOUND', body, status: 'DELIVERED' },
    });
    await this.prisma.db.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 80), unread: true, status: 'OPEN' },
    });
    return message;
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  listTemplates() {
    return this.prisma.db.messageTemplate.findMany({ orderBy: { name: 'asc' } });
  }
  createTemplate(dto: { name: string; channel: MessageChannel; subject?: string; body: string }, tenantId: string) {
    return this.prisma.db.messageTemplate.create({ data: { tenantId, ...dto } });
  }
  updateTemplate(id: string, dto: { name?: string; channel?: MessageChannel; subject?: string; body?: string }) {
    return this.prisma.db.messageTemplate.update({ where: { id }, data: dto });
  }
  async deleteTemplate(id: string) {
    await this.prisma.db.messageTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  /** Post a [System] message into a customer's thread (e.g. "Client signed the agreement"). */
  async postSystem(customerId: string, body: string, tenantId: string) {
    const thread = await this.getOrCreateThread(customerId, tenantId);
    await this.prisma.db.message.create({
      data: { tenantId, threadId: thread.id, channel: 'SYSTEM', direction: 'INBOUND', body, status: 'DELIVERED' },
    });
    await this.prisma.db.messageThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 80), unread: true },
    });
  }
}
