import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRole } from '@omnipos/db';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ALL_PERMISSIONS, PERMISSION_CATALOG, ROLE_DEFAULTS, effectivePermissions } from '../auth/permissions';

export interface CreateStaffDto {
  email: string;
  fullName: string;
  role: UserRole;
  storeId?: string | null;
  password: string;
  permissions?: string[];
}

export interface UpdateStaffDto {
  fullName?: string;
  role?: UserRole;
  storeId?: string | null;
  active?: boolean;
  permissions?: string[];
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Permission catalog + role defaults — for the staff-management UI. */
  permissionCatalog() {
    return { catalog: PERMISSION_CATALOG, roleDefaults: ROLE_DEFAULTS, all: ALL_PERMISSIONS };
  }

  /** List staff. HQ admin sees all; store managers are scoped to their store by the controller. */
  async list(storeId?: string) {
    const users = await this.prisma.db.user.findMany({
      where: {
        role: { not: 'CUSTOMER' },
        ...(storeId ? { storeId } : {}),
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
    });
    return users.map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      storeId: u.storeId,
      storeName: u.store?.name ?? null,
      active: u.active,
      permissions: u.permissions,
      effectivePermissions: effectivePermissions(u.role, u.permissions),
      mustResetPassword: u.mustResetPassword,
      createdAt: u.createdAt,
    }));
  }

  async create(dto: CreateStaffDto, tenantId: string) {
    if (dto.role === 'CUSTOMER') throw new BadRequestException('Cannot create CUSTOMER as staff');

    const existing = await this.prisma.db.user.findFirst({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('A user with that email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.db.user.create({
      data: {
        tenantId,
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        storeId: dto.storeId ?? null,
        passwordHash,
        permissions: dto.permissions ?? [],
        mustResetPassword: true,
      },
    });
    await this.audit.log({ action: 'STAFF_CREATE', entityType: 'user', entityId: user.id, metadata: { role: dto.role } });
    return this.publicShape(user);
  }

  async update(id: string, dto: UpdateStaffDto) {
    const user = await this.prisma.db.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.storeId !== undefined && { storeId: dto.storeId }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.permissions !== undefined && { permissions: dto.permissions }),
      },
    });
    await this.audit.log({ action: 'STAFF_UPDATE', entityType: 'user', entityId: id });
    return this.publicShape(user);
  }

  async resetPassword(id: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.db.user.update({
      where: { id },
      data: { passwordHash, mustResetPassword: false },
    });
    await this.audit.log({ action: 'STAFF_PASSWORD_RESET', entityType: 'user', entityId: id });
    return { ok: true };
  }

  async deactivate(id: string) {
    const user = await this.prisma.db.user.update({ where: { id }, data: { active: false } });
    await this.audit.log({ action: 'STAFF_DEACTIVATE', entityType: 'user', entityId: id });
    return this.publicShape(user);
  }

  private publicShape(u: { id: string; email: string; fullName: string; role: UserRole; storeId: string | null; active: boolean; permissions: string[] }) {
    return {
      id: u.id, email: u.email, fullName: u.fullName, role: u.role,
      storeId: u.storeId, active: u.active, permissions: u.permissions,
    };
  }
}
