import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { cleanupAll, createTestStaff, createTestUser } from "@/testHelpers";
import {
  DEFAULT_THRESHOLDS,
  MAX_NEW_FLAGS_PER_RUN,
  RECORD_RULE_MIN_NET_KOBO,
  detectStakePatterns,
  orderPair,
  patternReasons,
  summarisePairs,
  type PairStats,
  type SettledStakedBattle,
  type StakePatternThresholds,
} from "./stakePatterns";

/**
 * Repeated-pair collusion detection. Two halves, tested separately on
 * purpose: the arithmetic (`summarisePairs`, `patternReasons`) is where a
 * rule is actually wrong when it is wrong, so it is tested as pure functions
 * with no database at all; the sweep is then tested against a real Postgres
 * for the things arithmetic cannot show — that a pair is flagged once and
 * not once every two minutes, that both alert channels fire, and that the
 * settings actually move the line.
 *
 * The pair fixtures are all ₦20,000 a Battle: five of them is ₦100,000 net,
 * comfortably over the record rule's ₦50,000 floor and comfortably under the
 * ₦500,000 high-value threshold, so a one-sided fixture can only be caught by
 * the rule it is meant to exercise.
 */

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));

const NAIRA = 100;
const STAKE = 20_000 * NAIRA; // ₦20,000

const TEST_THRESHOLDS = {
  stakePatternWindowDays: 90,
  stakePatternMinBattles: 5,
  stakePatternWinShareBps: 8000,
  stakePatternNetAlertKobo: 50_000_000, // ₦500,000
};

let original: Record<string, unknown> | null = null;

beforeEach(async () => {
  // The settings row is a singleton shared with every other test file — take
  // a whole copy so afterEach can put it back exactly, including the four
  // columns this file never touches.
  original = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...TEST_THRESHOLDS },
    update: TEST_THRESHOLDS,
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  delete process.env.TRUST_SAFETY_EMAIL;
  if (original) {
    const { id: _id, ...rest } = original;
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: rest });
  } else {
    await prisma.platformSetting.deleteMany({ where: { id: "singleton" } });
  }
  await cleanupAll();
});

// ---------------------------------------------------------------------------
// The arithmetic — no database
// ---------------------------------------------------------------------------

function battle(
  one: string,
  two: string,
  winnerId: string,
  stakeAmount = STAKE,
  settledAt = new Date("2026-09-01T12:00:00.000Z")
): SettledStakedBattle {
  return { playerOneId: one, playerTwoId: two, winnerId, stakeAmount, settledAt };
}

function stats(overrides: Partial<PairStats> = {}): PairStats {
  return {
    userAId: "a",
    userBId: "b",
    battleCount: 0,
    userAWins: 0,
    userBWins: 0,
    netKobo: 0,
    firstBattleAt: null,
    lastBattleAt: null,
    ...overrides,
  };
}

const thresholds = (overrides: Partial<StakePatternThresholds> = {}): StakePatternThresholds => ({
  ...DEFAULT_THRESHOLDS,
  ...overrides,
});

describe("orderPair", () => {
  it("puts two ids in one fixed order whichever way round they arrive", () => {
    // The whole dedupe rests on this: (A,B) and (B,A) both spelling
    // themselves the same way is what makes the partial unique index mean
    // anything at all.
    expect(orderPair("zzz", "aaa")).toEqual({ userAId: "aaa", userBId: "zzz" });
    expect(orderPair("aaa", "zzz")).toEqual({ userAId: "aaa", userBId: "zzz" });
  });
});

describe("summarisePairs", () => {
  it("folds both spellings of a fixture into one pair", () => {
    // Battles between the same two accounts don't always record them the
    // same way round — the creator is one of them, and either can be the
    // creator. A fold that keyed on the ordered pair would produce two rows
    // and halve every count.
    const pairs = summarisePairs([battle("aaa", "zzz", "aaa"), battle("zzz", "aaa", "aaa")]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ userAId: "aaa", userBId: "zzz", battleCount: 2, userAWins: 2, userBWins: 0 });
  });

  it("signs the net from the lower id's side, whichever of them wins", () => {
    const upOnB = summarisePairs([battle("aaa", "zzz", "aaa", 1_000)]);
    expect(upOnB[0].netKobo).toBe(1_000);

    const downOnB = summarisePairs([battle("aaa", "zzz", "zzz", 1_000)]);
    expect(downOnB[0].netKobo).toBe(-1_000);
  });

  it("nets out wins and losses between the same pair rather than summing gross", () => {
    // Four Battles of ₦10 each, split two apiece: the pot moves every time,
    // but nothing has crossed between these accounts and a gross sum would
    // say ₦40 had.
    const pairs = summarisePairs([
      battle("aaa", "zzz", "aaa", 1_000),
      battle("aaa", "zzz", "zzz", 1_000),
      battle("aaa", "zzz", "aaa", 1_000),
      battle("aaa", "zzz", "zzz", 1_000),
    ]);

    expect(pairs[0]).toMatchObject({ battleCount: 4, userAWins: 2, userBWins: 2, netKobo: 0 });
  });

  it("reports the first and last settlement, not the order they arrived in", () => {
    const early = new Date("2026-08-01T00:00:00.000Z");
    const late = new Date("2026-09-20T00:00:00.000Z");
    const pairs = summarisePairs([
      battle("aaa", "zzz", "aaa", 1_000, late),
      battle("aaa", "zzz", "aaa", 1_000, early),
    ]);

    expect(pairs[0].firstBattleAt).toEqual(early);
    expect(pairs[0].lastBattleAt).toEqual(late);
  });

  it("keeps separate pairs separate", () => {
    const pairs = summarisePairs([battle("aaa", "zzz", "aaa"), battle("aaa", "mmm", "aaa")]);
    expect(pairs).toHaveLength(2);
  });

  it("ignores a Battle whose winner is neither player, rather than counting it for someone", () => {
    // Defensive: the query filters to a settled winner, but a winner who is
    // not one of the two players would silently inflate a count and push a
    // pair over the sample floor.
    expect(summarisePairs([battle("aaa", "zzz", "someone-else")])).toEqual([]);
  });

  it("ignores a Battle of an account against itself", () => {
    expect(summarisePairs([battle("aaa", "aaa", "aaa")])).toEqual([]);
  });
});

describe("patternReasons", () => {
  it("flags a one-sided run once the sample floor and the money floor are both met", () => {
    const reasons = patternReasons(stats({ battleCount: 5, userAWins: 5, netKobo: RECORD_RULE_MIN_NET_KOBO }), thresholds());
    expect(reasons).toEqual(["ONE_SIDED"]);
  });

  it("does not judge a record below the sample floor, however lopsided or large", () => {
    // Four Battles at ₦40,000 each is ₦160,000 moved and a 4-0 sweep, and it
    // is still four Battles. This is the knob that decides how much of the
    // queue is noise, so it has to actually bound the rule.
    const reasons = patternReasons(stats({ battleCount: 4, userAWins: 4, netKobo: 160_000 * NAIRA }), thresholds());
    expect(reasons).toEqual([]);
  });

  it("does not call a modestly uneven record lopsided", () => {
    // 4-2 is 67%, under the 80% line.
    expect(patternReasons(stats({ battleCount: 6, userAWins: 4, userBWins: 2, netKobo: 100_000 * NAIRA }), thresholds())).toEqual([]);
  });

  it("does not queue a lopsided record that moved almost nothing", () => {
    // Five wins at ₦100 each. The record is as one-sided as it gets and the
    // pair has moved ₦500 — a queue with this in it is a queue staff stop
    // reading.
    expect(patternReasons(stats({ battleCount: 5, userAWins: 5, netKobo: 50_000 }), thresholds())).toEqual([]);
  });

  it("counts a share sitting exactly on the threshold", () => {
    // 4 of 5 is exactly 80.00% and "at least 80%" has to include it — an
    // off-by-one on a detection threshold is the kind of thing that only
    // shows up as a pair nobody ever caught.
    expect(patternReasons(stats({ battleCount: 5, userAWins: 4, userBWins: 1, netKobo: RECORD_RULE_MIN_NET_KOBO }), thresholds())).toEqual([
      "ONE_SIDED",
    ]);
  });

  it("flags a large two-way flow on the size alone, with a perfectly even record", () => {
    // Ten Battles, five each, ₦600,000 net. No record rule will ever catch
    // this — a slow drain between two accounts looks like two people who
    // play each other a lot — which is the whole reason the second rule
    // exists.
    const reasons = patternReasons(stats({ battleCount: 10, userAWins: 5, userBWins: 5, netKobo: 60_000_000 }), thresholds());
    expect(reasons).toEqual(["HIGH_VALUE"]);
  });

  it("reports both reasons, in a fixed order, when both apply", () => {
    const both = stats({ battleCount: 10, userAWins: 9, userBWins: 1, netKobo: 80_000_000 });
    expect(patternReasons(both, thresholds())).toEqual(["ONE_SIDED", "HIGH_VALUE"]);
    // The stored order must not depend on which side is up.
    expect(patternReasons({ ...both, netKobo: -80_000_000 }, thresholds())).toEqual(["ONE_SIDED", "HIGH_VALUE"]);
  });

  it("reads the negative net of a pair the other way up as the same size", () => {
    // netKobo is signed; a rule that compared the signed value against a
    // positive threshold would only ever catch one direction.
    expect(patternReasons(stats({ battleCount: 10, userAWins: 5, userBWins: 5, netKobo: -60_000_000 }), thresholds())).toEqual(["HIGH_VALUE"]);
  });
});

// ---------------------------------------------------------------------------
// The sweep — real Postgres
// ---------------------------------------------------------------------------

let matchCounter = 0;

/** A settled staked Battle between two accounts, with the Match that decided it. */
async function settledBattle(
  playerOneId: string,
  playerTwoId: string,
  winnerId: string,
  stakeAmount = STAKE,
  settledAt?: Date
) {
  matchCounter += 1;
  const battle = await prisma.battle.create({
    data: {
      creatorId: playerOneId,
      targetUserId: playerTwoId,
      game: "Test Game",
      format: "SINGLE",
      visibility: "OPEN",
      stakeAmount,
      status: "COMPLETE",
      expiresAt: new Date(Date.now() + 3_600_000),
      ...(settledAt ? { updatedAt: settledAt } : {}),
    },
  });
  await prisma.match.create({
    data: {
      battleId: battle.id,
      matchCode: `TEST-PATTERN-${Date.now()}-${matchCounter}`,
      playerAId: playerOneId,
      playerBId: playerTwoId,
      status: "COMPLETE",
      winnerId,
    },
  });
  return battle;
}

/** A pair that has played `count` settled staked Battles, `winsA` of them to the first account. */
async function pairWithRecord(count: number, winsA: number, stakeAmount = STAKE) {
  const alice = await createTestUser();
  const bob = await createTestUser();
  for (let i = 0; i < count; i += 1) {
    await settledBattle(alice.id, bob.id, i < winsA ? alice.id : bob.id, stakeAmount);
  }
  return { alice, bob };
}

/** The open flag for a pair, whichever way round the ids sort. */
function openFlagFor(one: string, two: string) {
  const { userAId, userBId } = orderPair(one, two);
  return prisma.stakePatternFlag.findFirst({ where: { userAId, userBId, status: "OPEN" } });
}

function flagsFor(one: string, two: string) {
  const { userAId, userBId } = orderPair(one, two);
  return prisma.stakePatternFlag.count({ where: { userAId, userBId } });
}

describe("detectStakePatterns", () => {
  it("queues a one-sided pair with the numbers that put them there", async () => {
    const { alice, bob } = await pairWithRecord(5, 5);

    const result = await detectStakePatterns();

    expect(result.flagged).toBe(1);
    const flag = await openFlagFor(alice.id, bob.id);
    expect(flag).toMatchObject({
      battleCount: 5,
      userAWins: 5,
      userBWins: 0,
      netKobo: 5 * STAKE,
      reasons: ["ONE_SIDED"],
      windowDays: 90,
      status: "OPEN",
    });
    expect(flag!.firstBattleAt).not.toBeNull();
    // Signed from userA's side, and userA is whichever id sorts lower —
    // so the sign is the lower id's, not the first player's.
    const lowerIsAlice = alice.id < bob.id;
    expect(flag!.netKobo).toBe(lowerIsAlice ? 5 * STAKE : -5 * STAKE);
  });

  it("leaves an evenly matched pair alone", async () => {
    // The guard against a rule that just flags everyone who plays a lot.
    const { alice, bob } = await pairWithRecord(10, 5);

    const result = await detectStakePatterns();

    expect(result.flagged).toBe(0);
    expect(await flagsFor(alice.id, bob.id)).toBe(0);
  });

  it("queues a large two-way flow on the size alone", async () => {
    // This is what a slow drain actually looks like, and it took getting the
    // fixture wrong once to see it: at equal stakes the net IS the win
    // difference, so a pair with an even record has moved nothing. The rule
    // only says something new when the stakes are lopsided even though the
    // record isn't — six losses at ₦500 each against six wins at ₦100,000 is
    // a near-even record and ₦597,000 that has gone one way.
    const alice = await createTestUser();
    const bob = await createTestUser();
    for (let i = 0; i < 6; i += 1) await settledBattle(alice.id, bob.id, alice.id, 100_000 * NAIRA);
    for (let i = 0; i < 6; i += 1) await settledBattle(alice.id, bob.id, bob.id, 500 * NAIRA);

    const result = await detectStakePatterns();

    expect(result.flagged).toBe(1);
    const flag = await openFlagFor(alice.id, bob.id);
    expect(flag).toMatchObject({ reasons: ["HIGH_VALUE"], battleCount: 12 });
    // Sign-agnostic: which of the two sorts lower decides which way round
    // the signed figure runs.
    expect(Math.abs(flag!.netKobo)).toBe(6 * 100_000 * NAIRA - 6 * 500 * NAIRA);
  });

  it("alerts staff on both channels", async () => {
    // The instruction this implements was explicit: in-app *and* email, so a
    // flag is not missed by a staff member who simply wasn't logged in.
    process.env.TRUST_SAFETY_EMAIL = "trust@example.com";
    const staff = await createTestStaff();
    const { alice, bob } = await pairWithRecord(5, 5);

    await detectStakePatterns();

    const inApp = await prisma.notification.findFirst({ where: { userId: staff.id, type: "STAKE_PATTERN_FLAGGED" } });
    expect(inApp).not.toBeNull();
    expect(inApp!.payload).toMatchObject({ handleA: expect.any(String), handleB: expect.any(String), battleCount: 5 });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = vi.mocked(sendEmail).mock.calls[0];
    expect(to).toBe("trust@example.com");
    expect(subject).toContain(alice.handle);
    expect(subject).toContain(bob.handle);
    // The email has to carry the numbers, not just the fact — otherwise it
    // is a nudge to go and do the work the sweep already did.
    expect(body).toContain("5 settled staked Battles");
    expect(body).toContain("/admin/stakes");
  });

  it("sends no email when no address is configured, and still notifies in-app", async () => {
    // TRUST_SAFETY_EMAIL is optional; leaving it unset must be a working
    // configuration, not a broken one.
    const staff = await createTestStaff();
    await pairWithRecord(5, 5);

    await detectStakePatterns();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(await prisma.notification.count({ where: { userId: staff.id, type: "STAKE_PATTERN_FLAGGED" } })).toBe(1);
  });

  it("does not queue the same pair again on the next sweep, and does not re-alert", async () => {
    // The sweep runs every two minutes. Without this, a pair that stays
    // suspicious opens thirty flags an hour and thirty emails with them.
    const staff = await createTestStaff();
    const { alice, bob } = await pairWithRecord(5, 5);

    await detectStakePatterns();
    const second = await detectStakePatterns();
    const third = await detectStakePatterns();

    expect(second).toMatchObject({ flagged: 0, refreshed: 1 });
    expect(third).toMatchObject({ flagged: 0, refreshed: 1 });
    expect(await flagsFor(alice.id, bob.id)).toBe(1);
    expect(await prisma.notification.count({ where: { userId: staff.id, type: "STAKE_PATTERN_FLAGGED" } })).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("keeps the evidence on an open flag current while it waits", async () => {
    // A pair still playing while the flag sits in the queue is exactly when
    // the numbers matter most — a queue showing week-old counts is a queue
    // that gets dismissed as stale.
    const { alice, bob } = await pairWithRecord(5, 5);
    await detectStakePatterns();

    await settledBattle(alice.id, bob.id, alice.id);
    await detectStakePatterns();

    expect(await openFlagFor(alice.id, bob.id)).toMatchObject({ battleCount: 6, userAWins: 6, netKobo: 6 * STAKE });
  });

  it("lets a pair be flagged again after their flag is dismissed", async () => {
    // Dismissing is the answer to most flags — two friends who play each
    // other constantly. If it closed the pair for good, the one pair that
    // mattered would be the one nobody looked at twice.
    const { alice, bob } = await pairWithRecord(5, 5);
    await detectStakePatterns();
    await prisma.stakePatternFlag.updateMany({
      where: { userAId: orderPair(alice.id, bob.id).userAId, status: "OPEN" },
      data: { status: "DISMISSED" },
    });

    const result = await detectStakePatterns();

    expect(result.flagged).toBe(1);
    expect(await flagsFor(alice.id, bob.id)).toBe(2);
  });

  it("stops judging a pair once its Battles fall outside the window", async () => {
    // The lookback is the whole reason this is a rolling window rather than
    // a lifetime total: old games have to stop counting, and a pair that
    // played a lopsided run two years ago and nothing since is not a pair
    // worth a person's time today.
    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const alice = await createTestUser();
    const bob = await createTestUser();
    for (let i = 0; i < 5; i += 1) await settledBattle(alice.id, bob.id, alice.id, STAKE, longAgo);

    const result = await detectStakePatterns();

    expect(result.flagged).toBe(0);
    expect(await flagsFor(alice.id, bob.id)).toBe(0);
  });

  it("honours the configured thresholds", async () => {
    // Same fixture, three settings, three answers — the settings have to be
    // the thing that decides, or the admin control is decoration. 8-2 is
    // used rather than 5-0 because 5-0 is 100% and 10000 bps is the highest
    // a share can be set to, so a 5-0 fixture would fire whatever this was
    // raised to and prove nothing about the threshold moving.
    const set = (data: Record<string, number>) =>
      prisma.platformSetting.update({ where: { id: "singleton" }, data });

    await pairWithRecord(10, 8);
    expect((await detectStakePatterns()).flagged).toBe(1);

    await cleanupAll();
    await pairWithRecord(10, 8);
    await set({ stakePatternMinBattles: 20 });
    expect((await detectStakePatterns()).flagged).toBe(0);

    await cleanupAll();
    await pairWithRecord(10, 8);
    await set({ stakePatternMinBattles: 5, stakePatternWinShareBps: 9000 });
    expect((await detectStakePatterns()).flagged).toBe(0);

    await cleanupAll();
    await pairWithRecord(5, 5);
    await set({ stakePatternWinShareBps: 8000, stakePatternNetAlertKobo: 2_000_000_000 });
    // The record rule's own ₦50,000 floor still catches this one — pushing
    // the high-value threshold out of reach doesn't disarm the other rule.
    expect((await detectStakePatterns()).flagged).toBe(1);
  });

  it("does nothing at all when the lookback window is set to zero", async () => {
    const { alice, bob } = await pairWithRecord(5, 5);
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { stakePatternWindowDays: 0 } });

    const result = await detectStakePatterns();

    expect(result).toMatchObject({ flagged: 0, refreshed: 0 });
    expect(await flagsFor(alice.id, bob.id)).toBe(0);
  });

  it("caps how many pairs one run may newly queue", async () => {
    // Deploy day is the real hazard: the first sweep looks back over the
    // whole window at once, and an uncapped run is a hundred emails to a
    // person. The backlog drains over the following runs instead.
    const pairs: { alice: { id: string }; bob: { id: string } }[] = [];
    for (let i = 0; i < MAX_NEW_FLAGS_PER_RUN + 1; i += 1) {
      pairs.push(await pairWithRecord(5, 5));
    }

    const first = await detectStakePatterns();
    expect(first.flagged).toBe(MAX_NEW_FLAGS_PER_RUN);

    const second = await detectStakePatterns();
    expect(second.flagged).toBe(1);

    let queued = 0;
    for (const { alice, bob } of pairs) queued += await flagsFor(alice.id, bob.id);
    expect(queued).toBe(MAX_NEW_FLAGS_PER_RUN + 1);
  });

  it("ignores a free Battle", async () => {
    // Nothing crossed between these accounts, so there is nothing to see —
    // and the query's stakeAmount filter is what says so.
    const alice = await createTestUser();
    const bob = await createTestUser();
    for (let i = 0; i < 5; i += 1) await settledBattle(alice.id, bob.id, alice.id, 0);

    expect((await detectStakePatterns()).flagged).toBe(0);
    expect(await flagsFor(alice.id, bob.id)).toBe(0);
  });
});
