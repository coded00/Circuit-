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
import type { Match } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createBattleMatch } from "@/lib/matches";
import { notify } from "@/lib/notifications";
import { captureException } from "@/lib/observability";
import { getFriendIds } from "@/lib/friends";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";
import { battleExpiresAt } from "@/lib/battles";
import { blockedBetween } from "@/lib/blocks";
import { emailVerificationRequired } from "@/lib/emailGate";

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
  if (battleExpiresAt(battle).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This challenge has expired." }, { status: 409 });
  }
  if (battle.creatorId === user.id) {
    return NextResponse.json({ error: "You can't accept your own Battle." }, { status: 403 });
  }
  if (await blockedBetween(battle.creatorId, user.id)) {
    return NextResponse.json({ error: "This challenge isn't available to you." }, { status: 403 });
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
    const unverified = emailVerificationRequired(user);
    if (unverified) return unverified;
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
  let match: Match | null = null;
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

    match = await createBattleMatch(battle, user.id);
  } catch (err) {
    // Compensate only while no Match exists — the Match is the point of no
    // return. Once it exists the accept has succeeded and the Battle is
    // correctly ACCEPTED with the stake correctly locked; reopening the
    // Battle and handing the stake back would leave a live Match behind an
    // OPEN Battle, which is the first half of a double payout: a second
    // accepter takes the still-open Battle, gets a second Match, and both
    // Matches settle the same pot on completion. (src/app/api/quick-match/
    // [id]/accept/route.ts's second catch states the same rule for the same
    // reason.) `match` is assigned only when createBattleMatch resolved, and
    // that is a single `match.create` (createMatchWithUniqueCode), so a
    // throw from it cannot have left a Match behind.
    if (!match) {
      // Compare-and-swap the reopen rather than a plain update: only put the
      // Battle back if it is still the ACCEPTED this request set, so a
      // concurrent close isn't stomped back to OPEN. The refund happens
      // either way — no Match exists, so nothing was ever matched against
      // this stake.
      await prisma.$transaction(async (tx) => {
        await tx.battle.updateMany({ where: { id: battle.id, status: "ACCEPTED" }, data: { status: "OPEN" } });
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
    // A Match exists — the failure was downstream of it. Fall through and
    // report the Match rather than undoing a successful accept.
  }

  // TypeScript can't prove the assignment above ran (the catch may complete
  // without one, which is why the catch itself refuses to fall through in
  // that case); this is a real guard, not a formality. Binding it to a const
  // also keeps the narrowing inside the callback below.
  const acceptedMatch = match;
  if (!acceptedMatch) {
    throw new Error(`Battle ${battle.id} reached accept completion without a Match.`);
  }

  // Notification fan-out is deliberately best-effort, and deliberately after
  // the Match exists. `notify` rejects on any delivery error (InAppChannel is
  // a bare prisma.notification.create and Promise.all rejects on the first
  // one), and a failed notification must never undo a Match that was created
  // and a stake that was locked — that exact failure mode, a notify()
  // rejection landing in the catch above, is what used to reopen the Battle
  // and refund the stake while the Match lived on.
  await Promise.all([
    notify(battle.creatorId, "BATTLE_ACCEPTED", { battleId: battle.id }),
    notify(battle.creatorId, "MATCH_READY", { matchId: acceptedMatch.id }),
    notify(user.id, "MATCH_READY", { matchId: acceptedMatch.id }),
  ]).catch((err) => {
    captureException(err, { source: "battles/[id]/accept:notify", battleId: battle.id, matchId: acceptedMatch.id });
  });

  return NextResponse.json({ matchId: acceptedMatch.id }, { status: 201 });
}
