import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser, JwtPayload } from './auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly cls: ClsService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-only-change-me',
    });
  }

  /**
   * Runs during the auth guard. We populate the async request context (CLS)
   * with the tenant id so the tenant-scoped Prisma client and RLS apply to all
   * downstream queries in this request.
   */
  validate(payload: JwtPayload): AuthUser {
    this.cls.set('tenantId', payload.tenantId);
    this.cls.set('userId', payload.sub);
    this.cls.set('role', payload.role);

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      storeId: payload.storeId,
      email: payload.email,
      fullName: payload.fullName,
    };
  }
}
