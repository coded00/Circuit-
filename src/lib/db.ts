/**
 * Circuit — shared Prisma client.
 *
 * A single instance reused across hot reloads in dev; Next.js reloading
 * route modules would otherwise spawn a new PrismaClient (and a new
 * connection pool) on every edit.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
