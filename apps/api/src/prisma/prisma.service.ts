import {
  Injectable,
  InternalServerErrorException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@omnipos/db';
import { ClsService } from 'nestjs-cls';

/**
 * Prisma access with Row-Level Security tenant isolation.
 *
 *  - `db` (getter): a tenant-scoped client. Every operation runs inside a
 *    transaction that first sets `app.current_tenant` (transaction-local), so
 *    Postgres RLS restricts visibility to the current tenant. The tenant id is
 *    read from the async request context (CLS).
 *  - `asSystem(fn)`: runs `fn` with `app.bypass_rls` enabled, for the few
 *    cross-tenant/system operations (login, tenant resolution). Use sparingly.
 *
 * The bypass flag is only ever set here for explicitly trusted paths; ordinary
 * request handling never touches it.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly tenantClients = new Map<string, ReturnType<PrismaService['buildTenantClient']>>();

  constructor(private readonly cls: ClsService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Tenant-scoped client bound to the tenant in the current request context. */
  get db() {
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      throw new InternalServerErrorException('No tenant in request context');
    }
    return this.forTenant(tenantId);
  }

  /** Tenant-scoped client for an explicit tenant id (e.g. public site requests). */
  forTenant(tenantId: string) {
    let client = this.tenantClients.get(tenantId);
    if (!client) {
      client = this.buildTenantClient(tenantId);
      this.tenantClients.set(tenantId, client);
    }
    return client;
  }

  private buildTenantClient(tenantId: string) {
    const base = this as PrismaClient;
    return base.$extends({
      query: {
        async $allOperations({ args, query }) {
          // set_config + the operation execute in a single transaction, so the
          // transaction-local GUC is visible to RLS for the query.
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    });
  }

  /**
   * Run trusted cross-tenant work with RLS bypassed. The callback MUST use the
   * provided transaction client so the bypass flag applies to its queries.
   */
  async asSystem<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return fn(tx as unknown as PrismaClient);
    });
  }
}
