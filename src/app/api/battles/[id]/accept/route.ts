/**
 * Circuit — accept a Battle (Build Plan P4-4, maps: BTL-4).
 *
 * A staked Battle requires the accepter to match the creator's stake —
 * locked here, in the same window as the OPEN → ACCEPTED claim, so a
 * Match is never created for a stake that didn't actually get matched.
 * Core escrow mechanics only — see `EscrowType.STAKE`'s own schema
 * comment on what's deliberately not built yet.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createBattleMatch } from "@/lib/matches";
import { notify } from "@/lib/notifications";
import { getFriendIds } from "@/lib/friends";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";

class InsufficientWalletBalanceError extends Error {}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to accept a Battle." }, { status: 401 });
  }
  if (user.isSuspended) {
    return NextResponse.json(
      { error: `Your account is suspended: ${user.suspensionReason ?? "contact support."}` },
      { status: 403 }
    );
  }

  const { id } = await params;
  const battle = await prisma.battle.findUnique({ where: { id } });
  if (!battle) {
    return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  }
  if (battle.status !== "OPEN") {
    return NextResponse.json({ error: "This Battle isn't open anymore." }, { status: 409 });
  }
  if (battle.creatorId === user.id) {
    return NextResponse.json({ error: "You can't accept your own Battle." }, { status: 403 });
  }
  if (battle.visibility === "TARGETED" && battle.targetUserId !== user.id) {
    return NextResponse.json({ error: "This Battle was targeted at someone else." }, { status: 403 });
  }
  if (battle.visibility === "FRIENDS") {
    const friendIds = await getFriendIds(battle.creatorId);
    if (!friendIds.includes(user.id)) {
      return NextResponse.json({ error: "This Battle is only open to the creator's friends." }, { status: 403 });
    }
  }

  if (battle.stakeAmount > 0) {
    // ACC-3: matching a stake is cash-touching, same age gate as opening one.
    try {
      assertAgeGate(user.dateOfBirth);
    } catch (err) {
      if (err instanceof AgeGateError) {
        return NextResponse.json(
          {
            error:
              err.code === "MISSING_DOB"
                ? "Add your date of birth in your account settings before accepting a staked Battle."
                : err.message,
          },
          { status: 403 }
        );
      }
      throw err;
    }
  }

  // Two players clicking Accept on the same open Battle around the same
  // moment is a real scenario on a shared board, not a hypothetical — a
  // plain update() after the checks above would let both through. This
  // conditional update is the atomic compare-and-swap: only the request
  // that actually flips OPEN → ACCEPTED gets to create the Match.
  const claimed = await prisma.battle.updateMany({
    where: { id: battle.id, status: "OPEN" },
    data: { status: "ACCEPTED" },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "This Battle isn't open anymore." }, { status: 409 });
  }

  let stakeLocked = false;
  try {
    if (battle.stakeAmount > 0) {
      await prisma.$transaction(async (tx) => {
        const debited = await tx.user.updateMany({
          where: { id: user.id, walletBalance: { gte: battle.stakeAmount } },
          data: { walletBalance: { decrement: battle.stakeAmount } },
        });
        if (debited.count === 0) throw new InsufficientWalletBalanceError();

        await tx.escrowTransaction.create({
          data: { battleId: battle.id, userId: user.id, type: "STAKE", amount: battle.stakeAmount, status: "COMPLETE" },
        });
        await tx.walletTransaction.create({
          data: { userId: user.id, type: "STAKE_DEBIT", amount: battle.stakeAmount, status: "COMPLETE" },
        });
      });
      stakeLocked = true;
    }

    const match = await createBattleMatch(battle, user.id);
    await Promise.all([
      notify(battle.creatorId, "BATTLE_ACCEPTED", { battleId: battle.id }),
      notify(battle.creatorId, "MATCH_READY", { matchId: match.id }),
      notify(user.id, "MATCH_READY", { matchId: match.id }),
    ]);
    return NextResponse.json({ matchId: match.id }, { status: 201 });
  } catch (err) {
    // Don't leave the Battle stuck ACCEPTED with no Match behind it — and
    // if the accepter's stake was already locked, give it back, since
    // nothing was actually matched against it.
    await prisma.$transaction(async (tx) => {
      await tx.battle.update({ where: { id: battle.id }, data: { status: "OPEN" } });
      if (stakeLocked) {
        await tx.user.update({ where: { id: user.id }, data: { walletBalance: { increment: battle.stakeAmount } } });
        await tx.escrowTransaction.create({
          data: { battleId: battle.id, userId: user.id, type: "REFUND", amount: battle.stakeAmount, status: "COMPLETE" },
        });
        await tx.walletTransaction.create({
          data: { userId: user.id, type: "STAKE_CREDIT", amount: battle.stakeAmount, status: "COMPLETE" },
        });
      }
    });
    if (err instanceof InsufficientWalletBalanceError) {
      return NextResponse.json({ error: "Insufficient wallet balance to match this Battle's stake." }, { status: 402 });
    }
    throw err;
  }
}
