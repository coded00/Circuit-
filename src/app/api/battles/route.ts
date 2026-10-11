/**
 * Circuit — Battle creation (Build Plan P4-1, maps: BTL-1, BTL-3).
 *
 * `stakeAmount` above zero locks that amount from the creator's wallet
 * right here, in the same transaction as the Battle row itself — see
 * `EscrowType.STAKE`. That lock goes through `lockStake` (src/lib/stakes.ts),
 * which is where the kill switch and the per-account stake limits live — this
 * route no longer carries its own stake cap. Collusion detection and
 * self-exclusion tooling are still unbuilt; see that enum's own schema
 * comment for what docs/circuit-strategy.md still requires before this is a
 * launch-ready staked-Battles feature.
 */

import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify, notifyAllUsers } from "@/lib/notifications";
import { parseOptionalUrl } from "@/lib/validation";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { captureException } from "@/lib/observability";
import { parseExpiryHours } from "@/lib/battles";
import { canSendDirectChallenge } from "@/lib/privacy";
import { emailVerificationRequired } from "@/lib/emailGate";
import { InsufficientWalletBalanceError, StakeLimitError, lockStake } from "@/lib/stakes";

const VALID_FORMATS = ["SINGLE", "BEST_OF_3"];
const VALID_VISIBILITIES = ["OPEN", "TARGETED", "FRIENDS"];

// V1 audit follow-up: only an OPEN Battle triggers the same
// platform-wide notifyAllUsers blast tournament creation does (see this
// route's own comment on why FRIENDS/TARGETED don't) — scoped to that
// path specifically, not every Battle creation, since a TARGETED/FRIENDS
// Battle never reaches a wider audience regardless of how many get made.
const OPEN_BATTLE_CREATE_MAX_ATTEMPTS = 10;
const OPEN_BATTLE_CREATE_WINDOW_MS = 60 * 60 * 1000;

// The per-stake cap used to live here as a local constant, duplicated in
// src/lib/quickMatch.ts and mirrored in BattleForm.tsx. It (and the
// per-account limits that bound what one account can run at once) now live in
// src/lib/stakes.ts, enforced at the one point every stake is locked from.

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

  if (visibility === "OPEN") {
    const rateLimitKey = `open-battle-create:${user.id}`;
    const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, {
      max: OPEN_BATTLE_CREATE_MAX_ATTEMPTS,
      windowMs: OPEN_BATTLE_CREATE_WINDOW_MS,
    });
    if (limited) {
      return NextResponse.json(
        { error: "Too many open Challenges created recently. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }
    await recordAttempt(rateLimitKey);
  }

  if (!game) {
    return NextResponse.json({ error: "Game is required." }, { status: 400 });
  }
  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json({ error: "Format must be a single match or best of three." }, { status: 400 });
  }
  const expiryHours = parseExpiryHours(body?.expiresInHours);
  if (expiryHours === null) {
    return NextResponse.json({ error: "Choose how long the challenge stays open: 24 hours, 3 days or 7 days." }, { status: 400 });
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
    const direct = await canSendDirectChallenge(user.id, target);
    if (!direct.ok) return NextResponse.json({ error: direct.reason }, { status: 403 });
    targetUserId = target.id;
  }

  if (stakeAmount > 0) {
    // ACC-3: staking real money is cash-touching, same age gate as paid
    // tournament registration (TRU-5).
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
      const created = await tx.battle.create({
        data: {
          creatorId: user.id,
          game,
          format,
          visibility,
          targetUserId,
          streamUrl: streamUrlResult.url,
          stakeAmount,
          expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
        },
      });

      // After the row it hangs off, so lockStake can write the escrow row's
      // battleId — and inside this transaction, so a refusal here takes the
      // Battle row back with it.
      await lockStake(tx, { userId: user.id, amount: stakeAmount, battleId: created.id });

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
      // V1 audit follow-up: same reasoning as tournament creation's own
      // comment — an unhandled rejection inside after() was previously
      // invisible to any error-monitoring dashboard.
      after(() =>
        notifyAllUsers("NEW_CHALLENGE", { battleId: battle.id, game: battle.game }).catch((err) =>
          captureException(err, { source: "battles/route.ts:after", battleId: battle.id })
        )
      );
    }

    return NextResponse.json({ id: battle.id }, { status: 201 });
  } catch (err) {
    if (err instanceof InsufficientWalletBalanceError) {
      return NextResponse.json({ error: "Insufficient wallet balance for that stake." }, { status: 402 });
    }
    // A limit or the kill switch. `message` is written for the player.
    if (err instanceof StakeLimitError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
