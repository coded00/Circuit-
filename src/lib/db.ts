/**
 * Circuit — shared Prisma client.
 *
 * A single instance reused across hot reloads in dev; Next.js reloading
 * route modules would otherwise spawn a new PrismaClient (and a new
 * connection pool) on every edit.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Interactive transactions default to a 5s timeout, which a slow or distant
// database connection (Neon over the pooler adds ~0.5s per query) can blow
// through mid-way — e.g. bracket advancement after a match completes, which
// then leaves the match finished but the next round never created. Give
// every $transaction(async …) generous room instead; callers can still pass
// their own options.
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 30_000 } });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
