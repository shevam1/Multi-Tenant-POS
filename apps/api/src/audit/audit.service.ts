import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit trail of sensitive staff actions (appointment edits,
 * client info views, refunds, cancellations). Tenant + actor are taken from
 * the request context.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    const actorUserId = this.cls.get<string>('userId') ?? null;
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: this.cls.get<string>('tenantId'),
        actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.metadata ?? {}) as object,
      },
    });
  }
}
