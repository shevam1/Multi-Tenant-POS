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
      permissions,
    };
  }
}
