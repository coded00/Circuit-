/**
 * Circuit — Quick Match creation (fans one challenge out to many eligible
 * online players; see src/lib/quickMatch.ts for the shared logic and its
 * own doc comments on the money/concurrency design). Validation mirrors
 * src/app/api/battles/route.ts closely — same age gate, same stake cap,
 * same rate-limit shape — since this is structurally a Battle challenge,
 * just fanned out instead of aimed at one player or posted OPEN.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { trackEvent } from "@/lib/analytics";
import {
  DEFAULT_TIMEOUT_MS,
  InsufficientWalletBalanceError,
  MAX_STAKE_AMOUNT,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  VALID_FORMATS,
  getEligibleRecipients,
} from "@/lib/quickMatch";

const QUICK_MATCH_CREATE_MAX_ATTEMPTS = 10;
const QUICK_MATCH_CREATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to start a Quick Match." }, { status: 401 });
  }
  if (user.isSuspended) {
    return NextResponse.json(
      { error: `Your account is suspended: ${user.suspensionReason ?? "contact support."}` },
      { status: 403 }
    );
  }

  const rateLimitKey = `quick-match-create:${user.id}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, {
    max: QUICK_MATCH_CREATE_MAX_ATTEMPTS,
    windowMs: QUICK_MATCH_CREATE_WINDOW_MS,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Too many Quick Match requests recently. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  await recordAttempt(rateLimitKey);

  const body = await request.json().catch(() => null);
  const game = typeof body?.game === "string" ? body.game.trim() : "";
  const format = typeof body?.format === "string" ? body.format : "";
  const stakeAmount =
    typeof body?.stakeAmount === "number" && Number.isFinite(body.stakeAmount)
      ? Math.max(0, Math.floor(body.stakeAmount))
      : 0;
  const timeoutMs =
    typeof body?.timeoutMs === "number" && Number.isFinite(body.timeoutMs)
      ? Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.floor(body.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;

  if (!game) {
    return NextResponse.json({ error: "Game is required." }, { status: 400 });
  }
  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json({ error: "Format must be a single match or best of three." }, { status: 400 });
  }
  if (stakeAmount > MAX_STAKE_AMOUNT) {
    return NextResponse.json(
      { error: `Stake amount can't exceed ₦${(MAX_STAKE_AMOUNT / 100).toLocaleString("en-NG")}.` },
      { status: 400 }
    );
  }

  if (stakeAmount > 0) {
    try {
      assertAgeGate(user.dateOfBirth);
    } catch (err) {
      if (err instanceof AgeGateError) {
        return NextResponse.json(
          {
            error:
              err.code === "MISSING_DOB"
                ? "Add your date of birth in your account settings before starting a staked Quick Match."
                : err.message,
          },
          { status: 403 }
        );
      }
      throw err;
    }
  }

  const recipients = await getEligibleRecipients(user.id, { stakeAmount });
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "No eligible players are online for this game and stake right now." },
      { status: 409 }
    );
  }

  try {
    const challenge = await prisma.$transaction(async (tx) => {
      if (stakeAmount > 0) {
        const debited = await tx.user.updateMany({
          where: { id: user.id, walletBalance: { gte: stakeAmount } },
          data: { walletBalance: { decrement: stakeAmount } },
        });
        if (debited.count === 0) throw new InsufficientWalletBalanceError();
      }

      const created = await tx.quickMatchChallenge.create({
        data: {
          hostId: user.id,
          game,
          format,
          stakeAmount,
          expiresAt: new Date(Date.now() + timeoutMs),
        },
      });

      await tx.quickMatchRecipient.createMany({
        data: recipients.map((r) => ({ challengeId: created.id, recipientUserId: r.id })),
      });

      if (stakeAmount > 0) {
        await tx.escrowTransaction.create({
          data: {
            quickMatchChallengeId: created.id,
            userId: user.id,
            type: "STAKE",
            amount: stakeAmount,
            status: "COMPLETE",
          },
        });
        await tx.walletTransaction.create({
          data: { userId: user.id, type: "STAKE_DEBIT", amount: stakeAmount, status: "COMPLETE" },
        });
      }

      return created;
    });

    await Promise.all(
      recipients.map((r) =>
        notify(r.id, "QUICK_MATCH_CHALLENGE", { challengeId: challenge.id, hostHandle: user.handle, game })
      )
    );
    trackEvent("quick_match_created", { userId: user.id, game, amountMinor: stakeAmount });

    return NextResponse.json(
      { id: challenge.id, expiresAt: challenge.expiresAt, recipientCount: recipients.length },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof InsufficientWalletBalanceError) {
      return NextResponse.json({ error: "Insufficient wallet balance for that stake." }, { status: 402 });
    }
    throw err;
  }
}
