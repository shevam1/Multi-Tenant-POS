import type { UserRole } from '@omnipos/db';

/** Shape stored in the signed JWT and attached to each authenticated request. */
export interface AuthUser {
  userId: string;
  tenantId: string;
  role: UserRole;
  storeId: string | null;
  email: string;
  fullName: string;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  storeId: string | null;
  email: string;
  fullName: string;
}
