/**
 * Circuit — Battle creation (Build Plan P4-1, maps: BTL-1, BTL-3).
 *
 * `stakeAmount` above zero locks that amount from the creator's wallet
 * right here, in the same transaction as the Battle row itself — see
 * `EscrowType.STAKE`. Core escrow mechanics only (no per-account stake
 * limits, collusion detection, or self-exclusion tooling yet) — see that
 * enum's own schema comment on why this isn't yet what
 * docs/circuit-strategy.md considers a launch-ready staked-Battles
 * feature. Shipped as the underlying mechanism only, per explicit
 * product decision.
 */

import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify, notifyAllUsers } from "@/lib/notifications";
import { parseOptionalUrl } from "@/lib/validation";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";

const VALID_FORMATS = ["SINGLE", "BEST_OF_3"];
const VALID_VISIBILITIES = ["OPEN", "TARGETED", "FRIENDS"];

class InsufficientWalletBalanceError extends Error {}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to open a Battle." }, { status: 401 });
  }
  if (user.isSuspended) {
    return NextResponse.json(
      { error: `Your account is suspended: ${user.suspensionReason ?? "contact support."}` },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const game = typeof body?.game === "string" ? body.game.trim() : "";
  const format = typeof body?.format === "string" ? body.format : "";
  const visibility = VALID_VISIBILITIES.includes(body?.visibility) ? body.visibility : "OPEN";
  const targetHandle =
    typeof body?.targetHandle === "string" ? body.targetHandle.trim().replace(/^@/, "") : "";
  const stakeAmount =
    typeof body?.stakeAmount === "number" && Number.isFinite(body.stakeAmount)
      ? Math.max(0, Math.floor(body.stakeAmount))
      : 0;

  if (!game) {
    return NextResponse.json({ error: "Game is required." }, { status: 400 });
  }
  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json({ error: "Format must be a single match or best of three." }, { status: 400 });
  }
  const streamUrlResult = parseOptionalUrl(body?.streamUrl);
  if (!streamUrlResult.ok) {
    return NextResponse.json({ error: "Stream link must be a valid http(s) URL." }, { status: 400 });
  }

  let targetUserId: string | null = null;
  if (visibility === "TARGETED") {
    if (!targetHandle) {
      return NextResponse.json(
        { error: "A targeted Battle needs the handle of who you're challenging." },
        { status: 400 }
      );
    }
    const target = await prisma.user.findUnique({ where: { handle: targetHandle } });
    if (!target) {
      return NextResponse.json({ error: `No player found with handle @${targetHandle}.` }, { status: 400 });
    }
    if (target.id === user.id) {
      return NextResponse.json({ error: "You can't challenge yourself." }, { status: 400 });
    }
    targetUserId = target.id;
  }

  if (stakeAmount > 0) {
    // ACC-3: staking real money is cash-touching, same age gate as paid
    // tournament registration (TRU-5).
    try {
      assertAgeGate(user.dateOfBirth);
    } catch (err) {
      if (err instanceof AgeGateError) {
        return NextResponse.json(
          {
            error:
              err.code === "MISSING_DOB"
                ? "Add your date of birth in your account settings before opening a staked Battle."
                : err.message,
          },
          { status: 403 }
        );
      }
      throw err;
    }
  }

  try {
    const battle = await prisma.$transaction(async (tx) => {
      if (stakeAmount > 0) {
        // Atomic guard: a single conditional UPDATE, not a read-then-write
        // — same pattern as paid tournament registration.
        const debited = await tx.user.updateMany({
          where: { id: user.id, walletBalance: { gte: stakeAmount } },
          data: { walletBalance: { decrement: stakeAmount } },
        });
        if (debited.count === 0) throw new InsufficientWalletBalanceError();
      }

      const created = await tx.battle.create({
        data: {
          creatorId: user.id,
          game,
          format,
          visibility,
          targetUserId,
          streamUrl: streamUrlResult.url,
          stakeAmount,
        },
      });

      if (stakeAmount > 0) {
        await tx.escrowTransaction.create({
          data: { battleId: created.id, userId: user.id, type: "STAKE", amount: stakeAmount, status: "COMPLETE" },
        });
        await tx.walletTransaction.create({
          data: { userId: user.id, type: "STAKE_DEBIT", amount: stakeAmount, status: "COMPLETE" },
        });
      }

      return created;
    });

    if (targetUserId) {
      await notify(targetUserId, "BATTLE_CHALLENGE", { battleId: battle.id });
    }

    // Only OPEN Battles are "visible to everyone" (see BattleVisibility's
    // own schema comment) — FRIENDS/TARGETED already have their own
    // correctly-scoped audience, so blasting every user about a Challenge
    // most of them can't even accept would just be confusing. Deferred via
    // after() for the same not-blocking-the-response reason as tournament
    // creation.
    if (visibility === "OPEN") {
      after(() => notifyAllUsers("NEW_CHALLENGE", { battleId: battle.id, game: battle.game }));
    }

    return NextResponse.json({ id: battle.id }, { status: 201 });
  } catch (err) {
    if (err instanceof InsufficientWalletBalanceError) {
      return NextResponse.json({ error: "Insufficient wallet balance for that stake." }, { status: 402 });
    }
    throw err;
  }
}
