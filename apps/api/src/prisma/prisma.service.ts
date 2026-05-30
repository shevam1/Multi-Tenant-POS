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
 * ## How tenant isolation works
 *
 * Every operation that touches tenant data must satisfy the Postgres RLS policy:
 *
 *   USING  (tenantId = current_setting('app.current_tenant', true) OR bypass_rls = 'on')
 *   CHECK  (tenantId = current_setting('app.current_tenant', true) OR bypass_rls = 'on')
 *
 * The `db` getter returns a tenant-scoped extended Prisma client.
 * Every model operation on that client is intercepted by `$allOperations` and
 * wrapped in an interactive transaction that:
 *   1. Sets `app.current_tenant = <tenantId>`  (transaction-local GUC)
 *   2. Runs the operation via `tx[model][operation](args)` — **the transaction
 *      client, not `query(args)`.** This ensures both statements share the same
 *      Postgres connection (and thus the same GUC), which is the requirement for
 *      the RLS policy to see the setting.
 *
 * Why `tx[model][op]` not `query(args)`:
 *   `query(args)` is bound to the extended client's outer connection-pool slot,
 *   not to `tx`. Calling it inside `base.$transaction` still routes through the
 *   outer pool, so the GUC set on `tx` is invisible to it. Calling
 *   `tx.booking.findMany(args)` directly is guaranteed to use `tx`'s connection.
 *
 * ## asSystem
 * For cross-tenant / system work (auth, public tenant lookup), use `asSystem`
 * which sets `bypass_rls = 'on'` for the duration of the callback.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly tenantClients = new Map<string, ReturnType<PrismaService['buildTenantClient']>>();

  constructor(private readonly cls: ClsService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // Neon free tier may be sleeping. We loop until both $connect AND a live
    // SELECT 1 succeed — the server doesn't begin accepting HTTP requests until
    // this method resolves, so requests never hit a cold/uninitialised DB.
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        await this.$connect();
        await this.$queryRaw`SELECT 1`; // verify the compute is actually up
        console.log(`[Prisma] DB ready on attempt ${attempt}`);
        return;
      } catch (err) {
        if (attempt === 8) throw err;
        const wait = Math.min(attempt * 2000, 10_000);
        console.warn(`[Prisma] attempt ${attempt} failed, retrying in ${wait}ms…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Tenant-scoped client for the tenant in the current request context (JWT → CLS). */
  get db() {
    const tenantId = this.cls.get<string>('tenantId');
    if (!tenantId) {
      throw new InternalServerErrorException('No tenant in request context');
    }
    return this.forTenant(tenantId);
  }

  /** Tenant-scoped client for an explicit tenantId (e.g. public booking site, no JWT). */
  forTenant(tenantId: string) {
    if (!this.tenantClients.has(tenantId)) {
      this.tenantClients.set(tenantId, this.buildTenantClient(tenantId));
    }
    return this.tenantClients.get(tenantId)!;
  }

  /**
   * Build a Prisma extended client where every model operation is sent to
   * Postgres in a **batch transaction** together with a SET LOCAL that primes
   * the RLS GUC:
   *
   *   BEGIN;
   *   SELECT set_config('app.current_tenant', '<id>', TRUE);
   *   <original query>;            ← same connection, GUC is visible to RLS
   *   COMMIT;
   *
   * Why batch (array form) and NOT interactive ($transaction(async tx => {})):
   *   - Interactive transactions hold a dedicated connection open for the entire
   *     async callback. With rapid concurrent requests on Neon free tier this
   *     exhausts the connection pool ("Unable to start a transaction").
   *   - Batch transactions check out exactly ONE connection, execute atomically,
   *     and release immediately — identical connection cost to a single query.
   *   - Because both statements share the same connection, the transaction-local
   *     GUC is visible to RLS on the second statement.
   */
  private buildTenantClient(tenantId: string) {
    const base = this as PrismaClient;

    return base.$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          // Raw / non-model operations ($executeRaw etc.) — pass through.
          if (!model) return query(args);

          const results = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return (results as unknown[])[1];
        },
      },
    });
  }

  /**
   * Run a callback with RLS bypassed (for system/cross-tenant work only).
   * The `tx` passed to `fn` is the transaction client — all fn's queries must
   * go through it so the bypass flag is visible.
   */
  async asSystem<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return fn(tx as unknown as PrismaClient);
      },
      { timeout: 30_000, maxWait: 15_000 },
    );
  }
}
