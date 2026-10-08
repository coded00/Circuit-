/**
 * Circuit — repeated-pair collusion detection for staked Battles.
 *
 * Staked Battles are peer-to-peer: two accounts put up equal money and one
 * takes the pot. That is the feature, and it is also the shape of a
 * laundering path — two accounts that are really one person can pass money
 * back and forth until the wins look like winnings rather than a transfer,
 * and nothing about a single Battle looks wrong. The per-account stake
 * limits in src/lib/stakes.ts bound how much can move and how fast; they
 * cannot see that the same two accounts keep doing it. This module is the
 * other half, and it is the control docs/circuit-strategy.md §10 names
 * directly: "pattern detection on repeated losses between the same two
 * accounts".
 *
 * What this is not: an enforcement mechanism. Nothing here suspends an
 * account, withholds a payout, or blocks a Battle. It writes a row into a
 * queue (`StakePatternFlag`) and tells staff it did — a person decides what
 * it means. That distinction is the whole design. Two friends who play each
 * other every night will trip the win-record rule eventually, and a 5-0 run
 * between evenly matched players happens about 6% of the time by chance
 * alone, so a rule confident enough to act on its own would be a rule that
 * punishes people for having a rival.
 *
 * Two rules, either of which queues a pair:
 *
 *   ONE_SIDED   — the pair's settled Battles went one way (≥ `winShareBps`
 *                 to one account, over at least `minBattles` of them) AND
 *                 they moved at least RECORD_RULE_MIN_NET_KOBO. This is the
 *                 deliberate-throw shape: the money is the point, but the
 *                 record is the evidence, so it fires on modest amounts a
 *                 pure value threshold would ignore. The money floor exists
 *                 so a pair trading ₦100 games does not fill the queue.
 *
 *   HIGH_VALUE  — the pair moved at least `netAlertKobo` net, whatever the
 *                 record. This is the slow-drain shape: a pair cycling large
 *                 amounts at a near-even record never produces a lopsided
 *                 record for the rule above, and the size alone is the
 *                 reason to look.
 *
 * Both read the same measurement, so both come out of one pass over the
 * pair's Battles — see `summarisePairs`, which is pure and does the whole
 * calculation, and `detectStakePatterns`, which fetches, calls it, and
 * writes what it finds.
 *
 * Where it runs: `runScheduledSweep` (src/lib/matches.ts), on the same
 * two-minute cron as everything else, following that file's "one function,
 * branch inside it" preference rather than adding a second cron entry.
 */

import { prisma } from "@/lib/db";
import { notifyStaff } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { captureException } from "@/lib/observability";

export type StakePatternReason = "ONE_SIDED" | "HIGH_VALUE";

export const DEFAULT_PATTERN_WINDOW_DAYS = 90;
export const DEFAULT_PATTERN_MIN_BATTLES = 5;
export const DEFAULT_PATTERN_WIN_SHARE_BPS = 8000; // 80.00%
export const DEFAULT_PATTERN_NET_ALERT_KOBO = 50_000_000; // ₦500,000

/**
 * The least a pair must have moved before a lopsided win record means
 * anything. ₦50,000 — a tenth of the high-value threshold, and deliberately
 * a code constant rather than a fifth admin knob: it exists only to keep
 * small-stakes pairs out of the queue, nobody has a reason to tune "how
 * small is too small to care about" independently of the thresholds that
 * decide what "lopsided" means, and a knob nobody turns is a knob that
 * eventually gets set to something wrong.
 */
export const RECORD_RULE_MIN_NET_KOBO = 5_000_000; // ₦50,000

/**
 * How many pairs one sweep may newly flag. The alerts are emails to a real
 * person, and the first run after this ships looks back over the whole
 * window at once — without a ceiling, deploy day is a hundred emails. Pairs
 * over the ceiling are picked up on the next run two minutes later (the
 * already-open flags are refreshed, not re-created, so they cost nothing),
 * and candidates are considered largest-first, so what comes through first
 * is what most deserves a look.
 */
export const MAX_NEW_FLAGS_PER_RUN = 25;

/**
 * The largest net that gets stored on a flag, in kobo — ₦20,000,000.
 *
 * `StakePatternFlag.netKobo` is a Prisma `Int`, i.e. a PostgreSQL INT4, which
 * tops out at 2,147,483,647 (₦21,474,836.47), and a determined pair can pass
 * that: at a ₦100,000 stake a one-way ₦21.5m run is 215 settled Battles,
 * well inside what two accounts staking to their daily limit can do in a
 * 90-day window. Writing it unclamped would throw on the insert, and the
 * sweep's per-pair catch would drop the flag — losing exactly the pair that
 * most deserved one.
 *
 * So the stored figure saturates and the queue reads it as "at least". Only
 * the snapshot saturates: the rules are evaluated on the real number in JS,
 * which has no such ceiling, so detection is unaffected by this.
 */
export const MAX_STORED_NET_KOBO = 2_000_000_000;

/** Saturating write for `netKobo` — see MAX_STORED_NET_KOBO. */
export function clampStoredNet(kobo: number): number {
  return Math.max(-MAX_STORED_NET_KOBO, Math.min(MAX_STORED_NET_KOBO, kobo));
}

const REASON_ORDER: StakePatternReason[] = ["ONE_SIDED", "HIGH_VALUE"];

/** A settled, staked Battle reduced to what the rules actually read. */
export interface SettledStakedBattle {
  playerOneId: string;
  playerTwoId: string;
  winnerId: string;
  /** Kobo. What crossed from the loser to the winner — see `settleBattleOnComplete`. */
  stakeAmount: number;
  /** When the Battle settled; the window is measured on this. */
  settledAt: Date;
}

/** One unordered pair's numbers over the window. */
export interface PairStats {
  userAId: string;
  userBId: string;
  battleCount: number;
  userAWins: number;
  userBWins: number;
  /** Signed from `userAId`'s side: positive means A is up on B. */
  netKobo: number;
  firstBattleAt: Date | null;
  lastBattleAt: Date | null;
}

export interface StakePatternThresholds {
  windowDays: number;
  minBattles: number;
  winShareBps: number;
  netAlertKobo: number;
}

export const DEFAULT_THRESHOLDS: StakePatternThresholds = {
  windowDays: DEFAULT_PATTERN_WINDOW_DAYS,
  minBattles: DEFAULT_PATTERN_MIN_BATTLES,
  winShareBps: DEFAULT_PATTERN_WIN_SHARE_BPS,
  netAlertKobo: DEFAULT_PATTERN_NET_ALERT_KOBO,
};

/**
 * Puts two account ids in a fixed order so a pair has exactly one spelling.
 *
 * Load-bearing, not tidiness: the uniqueness that stops the sweep opening a
 * second flag for a pair every two minutes is a unique index on
 * (userAId, userBId) where status = 'OPEN'. If a pair could be written as
 * (A,B) on one sweep and (B,A) on the next, that index would permit both and
 * enforce nothing at all.
 */
export function orderPair(one: string, two: string): { userAId: string; userBId: string } {
  return one < two ? { userAId: one, userBId: two } : { userAId: two, userBId: one };
}

/**
 * Folds settled staked Battles into one row per unordered pair.
 *
 * Pure and exported so the arithmetic — which is where a detection rule is
 * actually wrong when it is wrong — can be tested on its own, without a
 * database and without the sweep around it.
 */
export function summarisePairs(battles: SettledStakedBattle[]): PairStats[] {
  const pairs = new Map<string, PairStats>();

  for (const battle of battles) {
    // A Battle against yourself is not a thing the app offers, and the
    // rules below would read it as a pair that always wins. Skip rather
    // than fold it in.
    if (battle.playerOneId === battle.playerTwoId) continue;
    // Defensive: the query filters to settled Battles with a winner, but a
    // winner who is neither player would silently corrupt every count.
    if (battle.winnerId !== battle.playerOneId && battle.winnerId !== battle.playerTwoId) continue;

    const { userAId, userBId } = orderPair(battle.playerOneId, battle.playerTwoId);
    const key = `${userAId}:${userBId}`;
    let pair = pairs.get(key);
    if (!pair) {
      pair = {
        userAId,
        userBId,
        battleCount: 0,
        userAWins: 0,
        userBWins: 0,
        netKobo: 0,
        firstBattleAt: null,
        lastBattleAt: null,
      };
      pairs.set(key, pair);
    }

    pair.battleCount += 1;
    if (battle.winnerId === userAId) {
      pair.userAWins += 1;
      pair.netKobo += battle.stakeAmount;
    } else {
      pair.userBWins += 1;
      pair.netKobo -= battle.stakeAmount;
    }
    if (!pair.firstBattleAt || battle.settledAt < pair.firstBattleAt) pair.firstBattleAt = battle.settledAt;
    if (!pair.lastBattleAt || battle.settledAt > pair.lastBattleAt) pair.lastBattleAt = battle.settledAt;
  }

  return [...pairs.values()];
}

/**
 * Which rules a pair's numbers trip, in a fixed order so a stored flag reads
 * the same way every time. Pure — the whole decision, no I/O.
 */
export function patternReasons(stats: PairStats, thresholds: StakePatternThresholds): StakePatternReason[] {
  const reasons: StakePatternReason[] = [];
  const net = Math.abs(stats.netKobo);

  // Integer basis points, rounded — 4 wins of 5 is exactly 8000, and a
  // threshold of 8000 has to mean 80% and not "80% minus a rounding error".
  const topWins = Math.max(stats.userAWins, stats.userBWins);
  const shareBps = stats.battleCount > 0 ? Math.round((topWins * 10_000) / stats.battleCount) : 0;
  const lopsided = stats.battleCount >= thresholds.minBattles && shareBps >= thresholds.winShareBps;

  if (lopsided && net >= RECORD_RULE_MIN_NET_KOBO) reasons.push("ONE_SIDED");
  if (net >= thresholds.netAlertKobo) reasons.push("HIGH_VALUE");

  return REASON_ORDER.filter((r) => reasons.includes(r));
}

/** The thresholds as they stand right now, falling back to the defaults on a fresh database. */
export async function loadThresholds(): Promise<StakePatternThresholds> {
  const setting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  return {
    windowDays: setting?.stakePatternWindowDays ?? DEFAULT_PATTERN_WINDOW_DAYS,
    minBattles: setting?.stakePatternMinBattles ?? DEFAULT_PATTERN_MIN_BATTLES,
    winShareBps: setting?.stakePatternWinShareBps ?? DEFAULT_PATTERN_WIN_SHARE_BPS,
    netAlertKobo: setting?.stakePatternNetAlertKobo ?? DEFAULT_PATTERN_NET_ALERT_KOBO,
  };
}

function money(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

/**
 * One sentence naming the numbers a pair was queued on. Takes handles rather
 * than ids because the only readers are a staff member's notification and
 * inbox, and "6-0" means nothing without knowing which account is which.
 */
export function describePattern(
  handles: { a: string; b: string },
  stats: PairStats,
  reasons: StakePatternReason[]
): string {
  const winner = stats.netKobo >= 0 ? handles.a : handles.b;
  const loser = stats.netKobo >= 0 ? handles.b : handles.a;
  const why = reasons.includes("ONE_SIDED")
    ? "one side wins nearly all of them"
    : "the amounts are large enough to matter on their own";
  return (
    `${stats.battleCount} settled staked Battles between @${handles.a} and @${handles.b}: ` +
    `@${handles.a} won ${stats.userAWins}, @${handles.b} won ${stats.userBWins}, ` +
    `and ${money(Math.abs(stats.netKobo))} has moved from @${loser} to @${winner} (${why}).`
  );
}

/**
 * Tells staff a pair was queued, on both channels.
 *
 * In-app *and* email on purpose: the in-app notification only reaches a
 * staff member who happens to open the admin — a flag that sits unseen for a
 * week is a flag that did nothing. This is alerting, not enforcement, so a
 * delivery failure must never lose the flag itself: the caller writes the
 * row first and calls this after, and every failure here is captured and
 * swallowed. Worst case the pair is in the queue with nobody paged, which is
 * what the dashboard count and /admin/stakes are for.
 */
export async function alertTrustAndSafety(params: {
  flagId: string;
  handleA: string;
  handleB: string;
  stats: PairStats;
  reasons: StakePatternReason[];
}): Promise<void> {
  const { flagId, handleA, handleB, stats, reasons } = params;
  const summary = describePattern({ a: handleA, b: handleB }, stats, reasons);

  try {
    await notifyStaff("STAKE_PATTERN_FLAGGED", {
      flagId,
      handleA,
      handleB,
      battleCount: stats.battleCount,
      userAWins: stats.userAWins,
      userBWins: stats.userBWins,
      netKobo: stats.netKobo,
      reasons,
    });
  } catch (err) {
    captureException(err, { source: "stakePatterns:notifyStaff", flagId });
  }

  // Unset means nobody has asked for the email — the in-app fan-out above
  // still happened, and .env.example documents what setting it turns on.
  const to = process.env.TRUST_SAFETY_EMAIL;
  if (!to) return;

  try {
    await sendEmail(
      to,
      `Staked Battles: @${handleA} and @${handleB} flagged for review`,
      [
        `@${handleA} and @${handleB} have been queued for review.`,
        "",
        summary,
        "",
        `Reasons: ${reasons.join(", ")}`,
        "",
        "This is a queue, not a finding — nothing has been actioned automatically.",
        "Review it at /admin/stakes.",
      ].join("\n")
    );
  } catch (err) {
    captureException(err, { source: "stakePatterns:email", flagId });
  }
}

/**
 * The sweep step. Reads the window, measures every pair, and queues the ones
 * that trip a rule.
 *
 * Idempotent by construction: a pair that already has an OPEN flag has its
 * evidence refreshed and is not alerted about again, so the two-minute cron
 * produces one alert per pair rather than one every two minutes. The
 * database enforces that too (the partial unique index) — the check here
 * exists so the common case is one query instead of an exception, not
 * because the constraint needs the help.
 */
export async function detectStakePatterns(now: Date = new Date()): Promise<{
  flagged: number;
  refreshed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let flagged = 0;
  let refreshed = 0;

  const thresholds = await loadThresholds();
  if (thresholds.windowDays <= 0) return { flagged, refreshed, errors };

  const since = new Date(now.getTime() - thresholds.windowDays * 24 * 60 * 60 * 1000);

  // One pass over the window, not one query per pair: the candidate set is
  // every settled staked Battle, which is small next to the number of pairs
  // it could contain, and doing it this way means the arithmetic all happens
  // in `summarisePairs` where it can be tested.
  const settled = await prisma.battle.findMany({
    where: {
      stakeAmount: { gt: 0 },
      status: "COMPLETE",
      targetUserId: { not: null },
      updatedAt: { gte: since },
    },
    select: {
      creatorId: true,
      targetUserId: true,
      stakeAmount: true,
      updatedAt: true,
      matches: {
        where: { status: "COMPLETE", winnerId: { not: null } },
        select: { winnerId: true },
        take: 1,
      },
    },
  });

  const battles: SettledStakedBattle[] = [];
  for (const battle of settled) {
    const winnerId = battle.matches[0]?.winnerId;
    // A staked Battle marked COMPLETE with no completed Match and no winner
    // has no record of who won, so it cannot say anything about a pair.
    if (!winnerId || !battle.targetUserId) continue;
    battles.push({
      playerOneId: battle.creatorId,
      playerTwoId: battle.targetUserId,
      winnerId,
      stakeAmount: battle.stakeAmount,
      settledAt: battle.updatedAt,
    });
  }

  const candidates = summarisePairs(battles)
    .map((stats) => ({ stats, reasons: patternReasons(stats, thresholds) }))
    .filter((c) => c.reasons.length > 0)
    // Largest first, so when the per-run ceiling bites it is the smaller
    // pairs that wait a couple of minutes, not the biggest one.
    .sort((a, b) => Math.abs(b.stats.netKobo) - Math.abs(a.stats.netKobo));

  for (const { stats, reasons } of candidates) {
    try {
      const existing = await prisma.stakePatternFlag.findFirst({
        where: { userAId: stats.userAId, userBId: stats.userBId, status: "OPEN" },
        select: { id: true },
      });

      const evidence = {
        reasons,
        battleCount: stats.battleCount,
        userAWins: stats.userAWins,
        userBWins: stats.userBWins,
        netKobo: clampStoredNet(stats.netKobo),
        windowDays: thresholds.windowDays,
        firstBattleAt: stats.firstBattleAt,
        lastBattleAt: stats.lastBattleAt,
      };

      // Already in the queue with nobody's answer on it. Keep the numbers
      // current and say nothing — staff were told once, and telling them
      // again every two minutes is how a real alert gets ignored.
      if (existing) {
        await prisma.stakePatternFlag.update({ where: { id: existing.id }, data: evidence });
        refreshed += 1;
        continue;
      }

      if (flagged >= MAX_NEW_FLAGS_PER_RUN) continue;

      const [userA, userB] = await Promise.all([
        prisma.user.findUnique({ where: { id: stats.userAId }, select: { handle: true } }),
        prisma.user.findUnique({ where: { id: stats.userBId }, select: { handle: true } }),
      ]);
      // An account deleted between the Battle query and here: the pair is
      // gone, and the flag would have a dangling half. Skip it.
      if (!userA || !userB) continue;

      let flagId: string;
      try {
        const flag = await prisma.stakePatternFlag.create({
          data: { userAId: stats.userAId, userBId: stats.userBId, status: "OPEN", ...evidence },
          select: { id: true },
        });
        flagId = flag.id;
      } catch (err) {
        // The partial unique index, doing its job: a sweep that overlapped
        // this one opened the flag first. Nothing to say — that run alerted.
        if (isUniqueViolation(err)) {
          refreshed += 1;
          continue;
        }
        throw err;
      }

      flagged += 1;
      await alertTrustAndSafety({ flagId, handleA: userA.handle, handleB: userB.handle, stats, reasons });
    } catch (err) {
      console.error(`[sweep] Error checking stake patterns for ${stats.userAId}/${stats.userBId}:`, err);
      captureException(err, { source: "sweep:stakePatterns", userAId: stats.userAId, userBId: stats.userBId });
      errors.push(`stakePattern:${stats.userAId}:${stats.userBId}`);
    }
  }

  return { flagged, refreshed, errors };
}

/** Prisma's unique-constraint error, narrowed without importing the whole error namespace. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
