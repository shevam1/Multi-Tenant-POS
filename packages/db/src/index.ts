import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/**
 * Singleton Prisma client. In dev we cache it on globalThis to survive
 * hot-reloads; in prod a single instance per process.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
