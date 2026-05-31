import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth.types';
import type { LoginDto } from './dto/login.dto';
import { effectivePermissions } from './permissions';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  static hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: AuthUser }> {
    // Tenant resolution + user lookup cross the tenant boundary, so they run as
    // a trusted system operation (RLS bypassed) — the only place that happens.
    const user = await this.prisma.asSystem(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { slug: dto.tenantSlug } });
      if (!tenant) return null;
      return tx.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
      });
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Login control (spec §6): a role with login disabled blocks all its users.
    if (user.roleId) {
      const role = await this.prisma.asSystem(tx => tx.role.findUnique({ where: { id: user.roleId! } }));
      if (role && !role.loginEnabled) {
        throw new UnauthorizedException('Login is disabled for your role. Contact your administrator.');
      }
    }

    const authUser: AuthUser = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      storeId: user.storeId,
      email: user.email,
      fullName: user.fullName,
    };

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      storeId: user.storeId,
      email: user.email,
      fullName: user.fullName,
    };

    return { accessToken: await this.jwt.signAsync(payload), user: authUser };
  }

  /** Live profile + effective permissions for the authenticated user. */
  async me(userId: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      include: { store: { select: { id: true, name: true } }, customRole: true },
    });
    if (!user) return null;
    // Effective permissions: explicit user overrides > custom-role perms > role defaults
    const permissions = user.permissions.length > 0
      ? user.permissions
      : user.customRole
        ? user.customRole.permissions
        : effectivePermissions(user.role, user.permissions);
    return {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      roleName: user.customRole?.name ?? user.role.replace(/_/g, ' '),
      storeId: user.storeId,
      storeName: user.store?.name ?? null,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      jobTitle: user.jobTitle,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      notifyEmail: user.notifyEmail,
      notifySms: user.notifySms,
      permissions,
    };
  }

  // ── Self-service account ("My Account") ─────────────────────────────────────

  /** Update own profile. Email changes are validated for uniqueness within tenant. */
  async updateProfile(userId: string, dto: Record<string, unknown>) {
    const me = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!me) throw new UnauthorizedException();

    const data: Record<string, unknown> = {};
    for (const k of ['fullName', 'phone', 'jobTitle', 'bio', 'avatarUrl', 'notifyEmail', 'notifySms'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (typeof dto.email === 'string' && dto.email !== me.email) {
      const clash = await this.prisma.db.user.findFirst({
        where: { tenantId: me.tenantId, email: dto.email, id: { not: userId } },
        select: { id: true },
      });
      if (clash) throw new UnauthorizedException('Email already in use');
      data.email = dto.email;
    }
    await this.prisma.db.user.update({ where: { id: userId }, data });
    return this.me(userId);
  }

  /** Change own password — requires the current password. */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) throw new UnauthorizedException('New password must be at least 8 characters');
    const me = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!me) throw new UnauthorizedException();
    const ok = await bcrypt.compare(currentPassword, me.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { passwordHash: await AuthService.hashPassword(newPassword), mustResetPassword: false },
    });
    return { ok: true };
  }
}
