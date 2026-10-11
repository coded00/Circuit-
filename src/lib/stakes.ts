/**
 * Circuit — the one place a Battle stake is locked.
 *
 * Staking money is the closest thing on Circuit to gambling
 * (docs/circuit-strategy.md §10), and the controls that make it safe are
 * per-account, not per-Battle: how much one account can have at risk at
 * once, how much it can put through in a day, and whether the player has
 * asked to be barred from staking entirely. A per-Battle cap cannot express
 * any of them. Twenty concurrent ₦100,000 Battles break no per-Battle rule
 * and are a ₦2,000,000 exposure between two colluding accounts.
 *
 * Every path that takes a stake goes through `lockStake` below. There are
 * exactly four, and before this module they each carried their own copy of
 * the debit and the escrow row — which is how a cap ends up enforced in
 * three of them:
 *
 *   - src/app/api/battles/route.ts            (creator opens a staked Battle)
 *   - src/app/api/battles/[id]/accept/route.ts (accepter matches it)
 *   - src/app/api/quick-match/route.ts         (host locks before any Battle)
 *   - src/lib/quickMatch.ts                    (accepter matches that host)
 *
 * Call `lockStake` AFTER the row it belongs to exists, inside the same
 * transaction — it needs the Battle or QuickMatchChallenge id for the escrow
 * row. A throw rolls the whole transaction back, so the row is not left
 * behind; that ordering is safe, and it is what lets this stay a single
 * function instead of a check that callers must remember to pair with a
 * debit.
 */

import type { DailyChallengeStatus, Prisma } from "@prisma/client";
import { isSelfExcluded, selfExclusionMessage } from "@/lib/selfExclusion";

/** ₦100,000 — the most a single Battle or Quick Match challenge may stake. */
export const MAX_STAKE_AMOUNT = 10_000_000;

/** Fallbacks for a PlatformSetting row that doesn't exist yet (a fresh database, a test). */
export const DEFAULT_MAX_LOCKED_STAKE = 50_000_000; // ₦500,000
export const DEFAULT_MAX_DAILY_STAKE = 100_000_000; // ₦1,000,000

/**
 * The rolling window the daily limit is measured over, and — because it is
 * a rolling window and not a calendar day — deliberately not a timezone
 * question. A calendar-day limit would reset at midnight WAT, which is a
 * thing to wait for; this one always has the last 24 hours in it.
 */
export const STAKE_WINDOW_MS = 24 * 60 * 60 * 1000;

export class InsufficientWalletBalanceError extends Error {}

/** Challenge states in which an entry fee is still at risk: the challenge has not finished paying out or been cancelled. */
const CHALLENGE_IN_PLAY: DailyChallengeStatus[] = ["SCHEDULED", "OPEN", "LIVE", "SUBMISSIONS_CLOSED", "UNDER_REVIEW", "PROVISIONAL"];

export type StakeLimitCode = "DISABLED" | "SELF_EXCLUDED" | "PER_BATTLE" | "LOCKED_TOTAL" | "DAILY_TOTAL";

/**
 * A stake that the limits refuse. Every one of these is a deliberate "no",
 * not a failure — callers should surface `message` to the player as a 4xx
 * rather than letting it reach the error handler as a 500.
 */
export class StakeLimitError extends Error {
  readonly code: StakeLimitCode;

  constructor(code: StakeLimitCode, message: string) {
    super(message);
    this.name = "StakeLimitError";
    this.code = code;
  }
}

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

type StakeTarget = {
  userId: string;
  amount: number;
  /** Set for a Battle stake — either an existing Battle, or one just created in this transaction. */
  battleId?: string;
  /** Set for the Quick Match host's stake, locked before any Battle exists. */
  quickMatchChallengeId?: string;
};

/**
 * One responsible-play budget per account, shared by everything that puts a player's own money at risk on a
 * result: Battle stakes and Daily Challenge entry fees. Two separate budgets would let a player run both at
 * full size, which is exactly the exposure the limits exist to bound, so both kinds of money are counted in
 * both limits and both entry points call this.
 *
 * The caller has already taken the account's row lock (see lockStake) — that is what makes these reads safe
 * against a double-click. This only reads and compares; it writes nothing.
 *
 * - "In play at once": stakes on open or accepted Battles and unaccepted Quick Matches, plus the entry fees of
 *   challenge entries that are still in the running in a challenge that hasn't finished.
 * - "In 24 hours": every stake and every challenge entry fee in the rolling window, refunded or not, so a
 *   withdraw-and-re-enter loop cannot hand the day's budget back.
 */
export async function assertWithinStakeBudget(
  tx: Prisma.TransactionClient,
  opts: { userId: string; amount: number; now: number; setting: { maxLockedStakeKobo: number; maxDailyStakeKobo: number } | null },
): Promise<void> {
  const { userId, amount, now, setting } = opts;
  const [locked, daily, challengeEntries, challengeDaily] = await Promise.all([
    tx.escrowTransaction.aggregate({
      where: {
        userId,
        type: "STAKE",
        OR: [
          { battle: { status: { in: ["OPEN", "ACCEPTED"] } } },
          // The host's stake on a challenge nobody has accepted yet: locked,
          // but with no Battle to hang off. Filtering on the battle relation
          // alone — as the wallet page's held-in-challenges figure does —
          // misses these, which would leave the gap exactly where a host
          // running many open challenges needs it counted.
          { battleId: null, quickMatchChallenge: { status: "PENDING" } },
        ],
      },
      _sum: { amount: true },
    }),
    // Every stake in the window, settled or refunded alike. Intentionally not
    // narrowed to still-locked rows: a refund that restored the day's budget
    // would let a pair move any amount by opening and cancelling in a loop.
    tx.escrowTransaction.aggregate({
      where: { userId, type: "STAKE", createdAt: { gte: new Date(now - STAKE_WINDOW_MS) } },
      _sum: { amount: true },
    }),
    // Challenge entry fees still in play: counted once per entry, by the challenge's own fee (immutable once
    // published), so a withdrawn-and-re-entered entry is not counted twice.
    tx.dailyChallengeEntry.findMany({
      where: { userId, status: { in: ["ENTERED", "SUBMITTED", "VERIFIED"] }, challenge: { status: { in: CHALLENGE_IN_PLAY } } },
      select: { challenge: { select: { entryFee: true } } },
    }),
    tx.escrowTransaction.aggregate({
      where: { userId, type: "CHALLENGE_ENTRY", createdAt: { gte: new Date(now - STAKE_WINDOW_MS) } },
      _sum: { amount: true },
    }),
  ]);

  const maxLocked = setting?.maxLockedStakeKobo ?? DEFAULT_MAX_LOCKED_STAKE;
  const lockedTotal = (locked._sum.amount ?? 0) + challengeEntries.reduce((a, e) => a + e.challenge.entryFee, 0);
  if (lockedTotal + amount > maxLocked) {
    throw new StakeLimitError(
      "LOCKED_TOTAL",
      `That would put ${naira(lockedTotal + amount)} of stakes and challenge entries in play at once, over your ${naira(maxLocked)} limit. A smaller amount, or wait for something open to settle.`
    );
  }

  const maxDaily = setting?.maxDailyStakeKobo ?? DEFAULT_MAX_DAILY_STAKE;
  const dailyTotal = (daily._sum.amount ?? 0) + (challengeDaily._sum.amount ?? 0);
  if (dailyTotal + amount > maxDaily) {
    throw new StakeLimitError(
      "DAILY_TOTAL",
      `That would put ${naira(dailyTotal + amount)} at stake in 24 hours, over your ${naira(maxDaily)} limit. Try again tomorrow.`
    );
  }
}

/**
 * The gates, then the debit, then the escrow row. Order matters: nothing is
 * written until every limit has passed, so a refusal costs one rolled-back
 * transaction and no cleanup.
 */
export async function lockStake(tx: Prisma.TransactionClient, target: StakeTarget): Promise<void> {
  const { userId, amount, battleId, quickMatchChallengeId } = target;
  // A free Battle never reaches here, but every caller guards with
  // `stakeAmount > 0` and this is the invariant that guard exists to keep —
  // stated here too so a future caller can just call it unconditionally.
  if (amount <= 0) return;

  const setting = await tx.platformSetting.findUnique({ where: { id: "singleton" } });
  // Null means no singleton row yet; the feature is enabled by default, so
  // only an explicit false is a refusal.
  if (setting?.stakedBattlesEnabled === false) {
    throw new StakeLimitError(
      "DISABLED",
      "Staked Battles are paused right now. You can still play free Battles."
    );
  }

  const now = Date.now();

  // Take the account's row lock BEFORE anything that reads this account's own
  // state. Without it, two requests staking at the same instant both read the
  // pre-stake total, both find room, and both debit — a limit that a
  // double-click defeats. This is the same serialization the conditional
  // wallet debit below gets for free, moved ahead of the reads that need it.
  //
  // It reads the cool-off in the same statement rather than in a query of its
  // own, so a lift or an extension landing mid-request is serialized against
  // this stake instead of racing it. The check sits ahead of the per-Battle
  // cap on purpose: an excluded player should be told they're excluded, not
  // told their amount is too large.
  const [account] = await tx.$queryRaw<{ selfExcludedUntil: Date | null }[]>`
    SELECT "selfExcludedUntil" FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  const excludedUntil = account?.selfExcludedUntil ?? null;
  if (isSelfExcluded(excludedUntil, now)) {
    throw new StakeLimitError("SELF_EXCLUDED", selfExclusionMessage(excludedUntil));
  }

  if (amount > MAX_STAKE_AMOUNT) {
    throw new StakeLimitError("PER_BATTLE", `Stake amount can't exceed ${naira(MAX_STAKE_AMOUNT)}.`);
  }

  await assertWithinStakeBudget(tx, { userId, amount, now, setting });

  // Atomic guard: a single conditional UPDATE, not a read-then-write — same
  // pattern as paid tournament registration, and still needed here even
  // though the row lock above already serializes this account, because the
  // balance can also move through paths that don't take a stake.
  const debited = await tx.user.updateMany({
    where: { id: userId, walletBalance: { gte: amount } },
    data: { walletBalance: { decrement: amount } },
  });
  if (debited.count === 0) throw new InsufficientWalletBalanceError();

  await tx.escrowTransaction.create({
    data: {
      battleId: battleId ?? null,
      quickMatchChallengeId: quickMatchChallengeId ?? null,
      userId,
      type: "STAKE",
      amount,
      status: "COMPLETE",
    },
  });
  await tx.walletTransaction.create({
    data: { userId, type: "STAKE_DEBIT", amount, status: "COMPLETE" },
  });
}
