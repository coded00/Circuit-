/**
 * Circuit — shared test fixtures for integration tests (src/**\/*.test.ts
 * files that hit the real database — not matched by vitest.config.mts's
 * own `include` glob itself, so this file is never run as a test suite).
 *
 * Every fixture this creates is named with a "TEST-" prefix (displayName/
 * tournament name) so it's trivially distinguishable from real data and
 * safe to run against a shared dev database, not just an isolated CI one
 * — same discipline every throwaway verification script this session
 * used. `cleanupAll()` deletes anything still carrying that prefix; call
 * it in an `afterEach`/`afterAll` so a crashed test doesn't leave litter
 * behind for the next run.
 */
import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export function uniqueSuffix(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}

// The "Unchecked" input variants use plain scalar foreign keys
// (organizerId: string) rather than nested-relation connect objects,
// matching how every caller below actually passes them — Prisma's
// generated *CreateInput (relation-object) type doesn't merge cleanly
// through a generic `Partial<Parameters<...>>` spread.
export async function createTestUser(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const suffix = uniqueSuffix();
  return prisma.user.create({
    data: {
      displayName: `TEST-User-${suffix}`,
      handle: `test-user-${suffix}`,
      emailOrPhone: `test-user-${suffix}@example.com`,
      ...overrides,
    },
  });
}

export async function createTestStaff(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  return createTestUser({ isStaff: true, ...overrides });
}

export async function createTestOrganizer(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const user = await createTestUser(overrides);
  await prisma.organizerProfile.create({ data: { userId: user.id } });
  return user;
}

export async function createTestTournament(
  organizerId: string,
  overrides: Partial<Prisma.TournamentUncheckedCreateInput> = {}
) {
  const suffix = uniqueSuffix();
  return prisma.tournament.create({
    data: {
      organizerId,
      name: `TEST-Tournament-${suffix}`,
      game: "Test Game",
      participantCap: 8,
      registrationOpenAt: new Date(Date.now() - 3_600_000),
      registrationCloseAt: new Date(Date.now() + 3_600_000),
      startAt: new Date(Date.now() + 7_200_000),
      ...overrides,
    },
  });
}

/** Deletes every row this file's fixtures could have created, anywhere
 *  it's still tagged "TEST-" — safe to call even if a given test created
 *  none of a particular kind (deleteMany on zero rows is a no-op). */
export async function cleanupAll(): Promise<void> {
  const users = await prisma.user.findMany({ where: { displayName: { startsWith: "TEST-" } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const tournaments = await prisma.tournament.findMany({ where: { name: { startsWith: "TEST-" } }, select: { id: true } });
  const tournamentIds = tournaments.map((t) => t.id);
  const battles = await prisma.battle.findMany({
    where: { OR: [{ creatorId: { in: userIds } }, { game: "Test Game" }] },
    select: { id: true },
  });
  const battleIds = battles.map((b) => b.id);

  // Matched by player too, not just tournamentId/battleId — a match
  // created directly against two test players with neither association
  // (e.g. a bare compare-and-swap fixture) would otherwise survive this
  // cleanup and then block deleting those users via Match's own RESTRICT
  // FK on playerAId/playerBId.
  const matchWhere = {
    OR: [
      { tournamentId: { in: tournamentIds } },
      { battleId: { in: battleIds } },
      { playerAId: { in: userIds } },
      { playerBId: { in: userIds } },
    ],
  };
  await prisma.dispute.deleteMany({ where: { match: matchWhere } });
  await prisma.match.deleteMany({ where: matchWhere });
  await prisma.battle.deleteMany({ where: { id: { in: battleIds } } });
  await prisma.escrowTransaction.deleteMany({ where: { OR: [{ tournamentId: { in: tournamentIds } }, { userId: { in: userIds } }] } });
  await prisma.registration.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { contains: "test-" } } });
  await prisma.auditLogEntry.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  await prisma.organizerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
