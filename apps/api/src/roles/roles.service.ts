import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRole } from '@omnipos/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ROLE_DEFAULTS } from '../auth/permissions';

const SYSTEM_ROLES: { key: UserRole; name: string }[] = [
  { key: 'FRANCHISE_HQ_ADMIN', name: 'HQ Admin' },
  { key: 'STORE_MANAGER', name: 'Store Manager' },
  { key: 'RECEPTION', name: 'Reception' },
  { key: 'GROOMER', name: 'Groomer' },
  { key: 'CALL_CENTER_AGENT', name: 'Call Center Agent' },
];

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Lazily seed the 5 system roles for a tenant (idempotent). */
  async ensureSeeded(tenantId: string) {
    const count = await this.prisma.db.role.count();
    if (count > 0) return;
    await this.prisma.db.$transaction(
      SYSTEM_ROLES.map(r =>
        this.prisma.db.role.create({
          data: { tenantId, key: r.key, name: r.name, baseRole: r.key, permissions: ROLE_DEFAULTS[r.key], isSystem: true, loginEnabled: true },
        }),
      ),
    );
  }

  async list(tenantId: string) {
    await this.ensureSeeded(tenantId);
    return this.prisma.db.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { users: true } } },
    });
  }

  async create(tenantId: string, dto: { name: string; baseRole: UserRole; permissions: string[]; loginEnabled?: boolean }) {
    const key = dto.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    const existing = await this.prisma.db.role.findFirst({ where: { key } });
    if (existing) throw new BadRequestException('A role with that name already exists');
    const role = await this.prisma.db.role.create({
      data: { tenantId, key, name: dto.name.trim(), baseRole: dto.baseRole, permissions: dto.permissions ?? [], loginEnabled: dto.loginEnabled ?? true, isSystem: false },
    });
    await this.audit.log({ action: 'ROLE_CREATE', entityType: 'role', entityId: role.id, metadata: { key, baseRole: dto.baseRole } });
    return role;
  }

  async update(id: string, dto: { name?: string; permissions?: string[]; loginEnabled?: boolean }) {
    const role = await this.prisma.db.role.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.permissions !== undefined && { permissions: dto.permissions }),
        ...(dto.loginEnabled !== undefined && { loginEnabled: dto.loginEnabled }),
      },
    });
    await this.audit.log({ action: 'ROLE_UPDATE', entityType: 'role', entityId: id });
    return role;
  }

  async remove(id: string) {
    const role = await this.prisma.db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    if (role._count.users > 0) throw new BadRequestException('Reassign staff before deleting this role');
    await this.prisma.db.role.delete({ where: { id } });
    await this.audit.log({ action: 'ROLE_DELETE', entityType: 'role', entityId: id });
  }
}
