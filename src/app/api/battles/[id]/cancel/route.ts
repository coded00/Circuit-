/**
 * Circuit — cancel an open Battle (Build Plan P4-6, maps: BTL-6).
 *
 * Only cancellable while still OPEN (before accept — see the atomic
 * compare-and-swap below), so the only stake ever locked at this point
 * is the creator's own, from creation. Refunded here if present.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

class AlreadyResolvedError extends Error {}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const battle = await prisma.battle.findUnique({ where: { id } });
  if (!battle) {
    return NextResponse.json({ error: "Battle not found." }, { status: 404 });
  }
  if (battle.creatorId !== user.id && !user.isStaff) {
    return NextResponse.json({ error: "Only the Battle's creator can cancel it." }, { status: 403 });
  }

  // The OPEN→CANCELLED compare-and-swap and the stake refund used to be
  // two separate transactions — a crash/error between them could leave
  // the Battle CANCELLED with the creator's stake still locked and never
  // credited back. One transaction now: either both happen or neither does.
  try {
    await prisma.$transaction(async (tx) => {
      const cancelled = await tx.battle.updateMany({
        where: { id: battle.id, status: "OPEN" },
        data: { status: "CANCELLED" },
      });
      if (cancelled.count === 0) throw new AlreadyResolvedError();

      if (battle.stakeAmount > 0) {
        await tx.user.update({
          where: { id: battle.creatorId },
          data: { walletBalance: { increment: battle.stakeAmount } },
        });
        await tx.escrowTransaction.create({
          data: { battleId: battle.id, userId: battle.creatorId, type: "REFUND", amount: battle.stakeAmount, status: "COMPLETE" },
        });
        await tx.walletTransaction.create({
          data: { userId: battle.creatorId, type: "STAKE_CREDIT", amount: battle.stakeAmount, status: "COMPLETE" },
        });
      }
    });
  } catch (err) {
    if (err instanceof AlreadyResolvedError) {
      return NextResponse.json(
        { error: "This Battle has already been accepted or cancelled." },
        { status: 409 }
      );
    }
    throw err;
  }

  if (user.isStaff && battle.creatorId !== user.id) {
    await logAdminAction({ actorId: user.id, action: "challenge.cancel", targetType: "Battle", targetId: id, metadata: { game: battle.game } });
  }

  return NextResponse.json({ ok: true });
}
