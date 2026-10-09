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

/**
 * A published game → mode → format trio, so a test can drive a route that resolves the catalogue
 * (src/lib/competitionConfig.ts). Every field `resolveCompetition` checks is set here: the game has to
 * be enabled *and* published, the mode and format enabled, and the format has to declare a structure
 * that actually exists — a half-built fixture fails with "Pick how the competition is run.", which
 * reads like a bug in the route rather than a hole in the fixture.
 */
export async function createTestCompetition() {
  const suffix = uniqueSuffix();
  const game = await prisma.game.create({
    data: { name: `TEST-Game-${suffix}`, publishedAt: new Date() },
  });
  const mode = await prisma.gameMode.create({
    data: { gameId: game.id, name: `TEST-Mode-${suffix}`, style: "HEAD_TO_HEAD" },
  });
  const format = await prisma.gameFormat.create({
    data: { modeId: mode.id, name: `TEST-Format-${suffix}`, structures: ["KNOCKOUT"] },
  });
  return { gameId: game.id, gameModeId: mode.id, gameFormatId: format.id };
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
  const quickMatches = await prisma.quickMatchChallenge.findMany({
    where: {
      OR: [{ hostId: { in: userIds } }, { game: "Test Game" }, { recipients: { some: { recipientUserId: { in: userIds } } } }],
    },
    select: { id: true },
  });
  const quickMatchIds = quickMatches.map((q) => q.id);

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
  // QuickMatchRecipient.challengeId and QuickMatchChallenge.hostId are
  // both ON DELETE RESTRICT — recipients must go before challenges, and
  // challenges before the users below, or those deletes fail outright.
  await prisma.quickMatchRecipient.deleteMany({ where: { challengeId: { in: quickMatchIds } } });
  await prisma.quickMatchChallenge.deleteMany({ where: { id: { in: quickMatchIds } } });
  await prisma.battle.deleteMany({ where: { id: { in: battleIds } } });
  await prisma.escrowTransaction.deleteMany({ where: { OR: [{ tournamentId: { in: tournamentIds } }, { userId: { in: userIds } }] } });
  await prisma.registration.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  // Marketplace: orders (RESTRICT on buyer/listing) before listings before users.
  await prisma.order.deleteMany({ where: { OR: [{ buyerId: { in: userIds } }, { listing: { sellerId: { in: userIds } } }] } });
  await prisma.listing.deleteMany({ where: { sellerId: { in: userIds } } });
  // Community, social and team rows a test user can leave behind (all RESTRICT on the user).
  const mine = { in: userIds };
  await prisma.communityPost.deleteMany({ where: { authorId: mine } });
  await prisma.friendship.deleteMany({ where: { OR: [{ requesterId: mine }, { addresseeId: mine }] } });
  await prisma.message.deleteMany({ where: { authorId: mine } });
  await prisma.communityMember.deleteMany({ where: { userId: mine } });
  await prisma.videoLike.deleteMany({ where: { userId: mine } });
  await prisma.videoSave.deleteMany({ where: { userId: mine } });
  await prisma.report.deleteMany({ where: { OR: [{ reportedUserId: mine }, { reportedById: mine }] } });
  await prisma.teamMembership.deleteMany({ where: { userId: mine } });
  await prisma.team.deleteMany({ where: { captainId: mine } });
  // Cascades off the user delete below anyway (StakePatternFlag's two user
  // FKs are ON DELETE CASCADE), but deleted explicitly so this file stays a
  // readable list of everything a fixture can leave behind.
  await prisma.stakePatternFlag.deleteMany({ where: { OR: [{ userAId: mine }, { userBId: mine }] } });
  await prisma.walletTransaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { contains: "test-" } } });
  await prisma.auditLogEntry.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.bracket.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
  // Cascades off the tournament delete below anyway, and off the user delete after that (both FKs are
  // ON DELETE CASCADE), but deleted explicitly so this file stays a readable list of everything a fixture
  // can leave behind.
  await prisma.tournamentSponsorship.deleteMany({ where: { OR: [{ tournamentId: { in: tournamentIds } }, { recordedById: { in: userIds } }] } });
  await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
  await prisma.organizerProfile.deleteMany({ where: { userId: { in: userIds } } });
  // The catalogue fixtures (createTestCompetition), after the tournaments that point at them. Modes and
  // formats cascade off the game.
  await prisma.game.deleteMany({ where: { name: { startsWith: "TEST-" } } });
  // Rate-limit rows are keyed by the user's id, not by anything matching "test-" above, so a route with
  // a 5-per-hour throttle would start answering 429 partway through a file without this.
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "tournament-create:" } } });
  // The money-out throttles (finding #17) are keyed by user id too, so they leak between tests the same
  // way — and at five an hour, a file that exercises either route would start answering 429 partway
  // through its sixth call. Same one-line fix as the line above.
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "wallet-withdraw:" } } });
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "prize-payout:" } } });
  // The caller-wide auth buckets (rateLimit.ts). These are the ones that would leak *between runs* rather
  // than between tests: a test request carries no headers, so every one of them is filed under the single
  // key "auth-ip:<scope>:unknown", and the 15-minute windows outlive the test process. Without this the
  // suite answers 429 on the fourth run of the day. The global counter is one shared row by design, so it
  // needs clearing for the same reason.
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "auth-ip:" } } });
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "auth-global:" } } });
  // The public read buckets (rateLimit.ts) have the same shape and the same leak: a test request carries no
  // headers, so every one is filed under "public-ip:<scope>:unknown", and the 1-minute windows outlive the
  // test file. The images limit is 1200, so this only matters for a file that makes a lot of requests — but
  // it is the same one-line fix as the two above and this file is meant to be the full list.
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "public-ip:" } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
