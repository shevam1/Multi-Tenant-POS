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
  roleId?: string | null;
  storeId?: string | null;
  password: string;
  permissions?: string[];
  phone?: string | null;
  jobTitle?: string | null;
}

export interface UpdateStaffDto {
  fullName?: string;
  role?: UserRole;
  roleId?: string | null;
  storeId?: string | null;
  active?: boolean;
  permissions?: string[];
  phone?: string | null;
  jobTitle?: string | null;
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
      phone: u.phone,
      jobTitle: u.jobTitle,
      storeId: u.storeId,
      storeName: u.store?.name ?? null,
      active: u.active,
      permissions: u.permissions,
      effectivePermissions: effectivePermissions(u.role, u.permissions),
      mustResetPassword: u.mustResetPassword,
      createdAt: u.createdAt,
    }));
  }

  /** Resolve a custom roleId → its baseRole enum (for RBAC guard compatibility). */
  private async baseRoleFor(roleId: string | null | undefined, fallback: UserRole): Promise<UserRole> {
    if (!roleId) return fallback;
    const role = await this.prisma.db.role.findUnique({ where: { id: roleId } });
    return (role?.baseRole as UserRole) ?? fallback;
  }

  async create(dto: CreateStaffDto, tenantId: string) {
    if (dto.role === 'CUSTOMER') throw new BadRequestException('Cannot create CUSTOMER as staff');

    const existing = await this.prisma.db.user.findFirst({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('A user with that email already exists');

    const role = await this.baseRoleFor(dto.roleId, dto.role);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.db.user.create({
      data: {
        tenantId,
        email: dto.email,
        fullName: dto.fullName,
        role,                       // enum base role keeps @Roles() guards working
        roleId: dto.roleId ?? null, // custom-role link drives permissions + login
        storeId: dto.storeId ?? null,
        passwordHash,
        permissions: dto.permissions ?? [],
        phone: dto.phone ?? null,
        jobTitle: dto.jobTitle ?? null,
        mustResetPassword: true,
      },
    });
    await this.audit.log({ action: 'STAFF_CREATE', entityType: 'user', entityId: user.id, metadata: { role, roleId: dto.roleId } });
    return this.publicShape(user);
  }

  async update(id: string, dto: UpdateStaffDto) {
    // When a roleId is provided, sync the enum base role for RBAC guards
    const roleEnum = dto.roleId !== undefined
      ? await this.baseRoleFor(dto.roleId, dto.role ?? 'GROOMER')
      : dto.role;
    const user = await this.prisma.db.user.update({
      where: { id },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(roleEnum !== undefined && { role: roleEnum }),
        ...(dto.roleId !== undefined && { roleId: dto.roleId }),
        ...(dto.storeId !== undefined && { storeId: dto.storeId }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.permissions !== undefined && { permissions: dto.permissions }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.jobTitle !== undefined && { jobTitle: dto.jobTitle }),
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

  private publicShape(u: { id: string; email: string; fullName: string; role: UserRole; storeId: string | null; active: boolean; permissions: string[]; phone?: string | null; jobTitle?: string | null }) {
    return {
      id: u.id, email: u.email, fullName: u.fullName, role: u.role,
      storeId: u.storeId, active: u.active, permissions: u.permissions,
      phone: u.phone ?? null, jobTitle: u.jobTitle ?? null,
    };
  }
}
