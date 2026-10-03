/**
 * Circuit — shared rules for a Challenge (the `Battle` model) that hasn't
 * been accepted yet: when it lapses, and the one place an OPEN challenge is
 * closed (cancelled by its creator, declined by the player it targeted, or
 * expired). Closing returns any stake the creator locked, in the same
 * transaction as the status change, so a lapse can't strand money.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

import { LEGACY_EXPIRY_HOURS } from "@/lib/battleExpiry";

export { BATTLE_EXPIRY_OPTIONS, DEFAULT_BATTLE_EXPIRY_HOURS, battleExpiresAt, parseExpiryHours } from "@/lib/battleExpiry";

/** For `where`: an OPEN challenge that hasn't lapsed yet (whether or not the sweep has closed it). */
export function openBattleFilter(now: Date = new Date()): Prisma.BattleWhereInput {
  return {
    status: "OPEN",
    OR: [{ expiresAt: { gt: now } }, { expiresAt: null, createdAt: { gt: new Date(now.getTime() - LEGACY_EXPIRY_HOURS * 60 * 60 * 1000) } }],
  };
}

/**
 * OPEN → CANCELLED or EXPIRED, refunding the creator's stake, atomically.
 * Returns false if it wasn't OPEN any more (accepted or already closed), in
 * which case nothing changed.
 */
export async function closeOpenBattle(battleId: string, to: "CANCELLED" | "EXPIRED"): Promise<boolean> {
  const battle = await prisma.battle.findUnique({ where: { id: battleId }, select: { id: true, creatorId: true, stakeAmount: true } });
  if (!battle) return false;
  return prisma.$transaction(async (tx) => {
    const closed = await tx.battle.updateMany({ where: { id: battle.id, status: "OPEN" }, data: { status: to } });
    if (closed.count === 0) return false;
    if (battle.stakeAmount > 0) {
      await tx.user.update({ where: { id: battle.creatorId }, data: { walletBalance: { increment: battle.stakeAmount } } });
      await tx.escrowTransaction.create({
        data: { battleId: battle.id, userId: battle.creatorId, type: "REFUND", amount: battle.stakeAmount, status: "COMPLETE" },
      });
      await tx.walletTransaction.create({ data: { userId: battle.creatorId, type: "STAKE_CREDIT", amount: battle.stakeAmount, status: "COMPLETE" } });
    }
    return true;
  });
}

/**
 * The sweep's job: close every OPEN challenge that has lapsed (stake back
 * to the creator, creator told). Quick Match battles are left alone, since
 * that feature runs its own expiry. Bounded per run; the rest wait for the
 * next one.
 */
export async function expireOpenBattles(now: Date = new Date()): Promise<{ expired: number; errors: string[] }> {
  const lapsed = await prisma.battle.findMany({
    where: {
      status: "OPEN",
      quickMatchChallenge: null,
      OR: [{ expiresAt: { lte: now } }, { expiresAt: null, createdAt: { lte: new Date(now.getTime() - LEGACY_EXPIRY_HOURS * 60 * 60 * 1000) } }],
    },
    select: { id: true, creatorId: true, game: true },
    take: 50,
  });
  let expired = 0;
  const errors: string[] = [];
  for (const b of lapsed) {
    try {
      if (await closeOpenBattle(b.id, "EXPIRED")) {
        expired++;
        await notify(b.creatorId, "BATTLE_EXPIRED", { battleId: b.id, game: b.game }).catch(() => undefined);
      }
    } catch {
      errors.push(`battle:${b.id}`);
    }
  }
  return { expired, errors };
}
