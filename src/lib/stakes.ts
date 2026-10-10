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

import type { Prisma } from "@prisma/client";
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

/** The two ceilings, as stored on the PlatformSetting singleton. */
type StakeLimits = { maxLockedStakeKobo: number; maxDailyStakeKobo: number };

/** What an account has staked, against the limits it is held to. */
export type StakeBudget = {
  /** At risk right now: open and accepted Battles, plus a host's stake on a challenge nobody has taken. */
  lockedTotal: number;
  /** Everything staked in the last 24 hours — settled or refunded alike, which is what the limit counts. */
  dailyTotal: number;
  maxLocked: number;
  maxDaily: number;
};

/**
 * The four numbers a stake is judged by, and the only place they are read.
 *
 * `lockStake` calls this for the two comparisons it enforces, and the challenge
 * form and the Responsible play tab call it to show a player the same figures.
 * That is the point of it being one function: a readout that computed these
 * its own way could tell a player they had room and then refuse them, which is
 * worse than showing them nothing.
 *
 * `db` is a transaction when a stake is being locked, for the same reason
 * `lockStake` takes one — these reads must see the same snapshot as the debit
 * that follows them, and the row lock it takes first is what stops two
 * simultaneous stakes from both finding room.
 *
 * `limits` is the PlatformSetting row when the caller already has it:
 * `lockStake` reads it at the top for the kill switch, and passing it through
 * keeps the ceilings it enforces from the same read as the switch it enforces.
 * Leave it out and this reads the row; pass null for a database without one.
 */
export async function stakeBudget(db: Prisma.TransactionClient, userId: string, limits?: StakeLimits | null): Promise<StakeBudget> {
  const now = Date.now();
  const [setting, locked, daily] = await Promise.all([
    limits === undefined ? db.platformSetting.findUnique({ where: { id: "singleton" } }) : Promise.resolve(limits),
    db.escrowTransaction.aggregate({
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
    db.escrowTransaction.aggregate({
      where: { userId, type: "STAKE", createdAt: { gte: new Date(now - STAKE_WINDOW_MS) } },
      _sum: { amount: true },
    }),
  ]);

  return {
    lockedTotal: locked._sum.amount ?? 0,
    dailyTotal: daily._sum.amount ?? 0,
    maxLocked: setting?.maxLockedStakeKobo ?? DEFAULT_MAX_LOCKED_STAKE,
    maxDaily: setting?.maxDailyStakeKobo ?? DEFAULT_MAX_DAILY_STAKE,
  };
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

  const { lockedTotal, dailyTotal, maxLocked, maxDaily } = await stakeBudget(tx, userId, setting);

  if (lockedTotal + amount > maxLocked) {
    throw new StakeLimitError(
      "LOCKED_TOTAL",
      `That would put ${naira(lockedTotal + amount)} of stakes in play at once, over your ${naira(maxLocked)} limit. Smaller stake, or settle an open challenge first.`
    );
  }

  if (dailyTotal + amount > maxDaily) {
    throw new StakeLimitError(
      "DAILY_TOTAL",
      `That would stake ${naira(dailyTotal + amount)} in 24 hours, over your ${naira(maxDaily)} limit. Try again tomorrow.`
    );
  }

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
