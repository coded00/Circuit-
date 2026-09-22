/**
 * Circuit — accept a Quick Match challenge. The "first wins" mechanic: a
 * standalone compare-and-swap on the challenge's own status claims it
 * (mirrors src/app/api/battles/[id]/accept/route.ts's proven OPEN→ACCEPTED
 * pattern, generalized to PENDING→ACCEPTED across N fanned-out
 * recipients), then a single transaction (src/lib/quickMatch.ts's
 * resolveQuickMatchAcceptance) handles every consequence of winning —
 * debit, Battle creation, escrow, and invalidating every other pending
 * recipient — atomically. See that function's own doc comment for why
 * Match creation happens after the transaction commits, not inside it.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createBattleMatch } from "@/lib/matches";
import { notify } from "@/lib/notifications";
import { AgeGateError, assertAgeGate } from "@/lib/age-gate";
import { trackEvent } from "@/lib/analytics";
import { captureException } from "@/lib/observability";
import { InsufficientWalletBalanceError, recoverFailedAccept, resolveQuickMatchAcceptance } from "@/lib/quickMatch";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (user.isSuspended) {
    return NextResponse.json(
      { error: `Your account is suspended: ${user.suspensionReason ?? "contact support."}` },
      { status: 403 }
    );
  }

  const { id } = await params;
  const challenge = await prisma.quickMatchChallenge.findUnique({ where: { id } });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }

  // Authorization: the caller must actually be one of the fanned-out
  // recipients — without this, any authenticated user could race for a
  // Quick Match they were never sent.
  const recipientRow = await prisma.quickMatchRecipient.findUnique({
    where: { challengeId_recipientUserId: { challengeId: id, recipientUserId: user.id } },
  });
  if (!recipientRow) {
    return NextResponse.json({ error: "You weren't challenged to this Quick Match." }, { status: 403 });
  }
  if (recipientRow.status !== "PENDING") {
    return NextResponse.json({ error: "This challenge is no longer available to you." }, { status: 409 });
  }

  if (challenge.stakeAmount > 0) {
    try {
      assertAgeGate(user.dateOfBirth);
    } catch (err) {
      if (err instanceof AgeGateError) {
        return NextResponse.json(
          {
            error:
              err.code === "MISSING_DOB"
                ? "Add your date of birth in your account settings before accepting a staked Quick Match."
                : err.message,
          },
          { status: 403 }
        );
      }
      throw err;
    }
  }

  // Same busy-exclusion the eligibility query applies at creation time,
  // re-checked here since time has passed since then — a recipient could
  // have entered another Battle/Match in the meantime.
  const busy = await prisma.match.findFirst({
    where: { status: { in: ["UPCOMING", "NEEDS_RESULT", "DISPUTED"] }, OR: [{ playerAId: user.id }, { playerBId: user.id }] },
  });
  if (busy) {
    return NextResponse.json({ error: "You're already in an active match." }, { status: 409 });
  }

  const claimed = await prisma.quickMatchChallenge.updateMany({
    where: { id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "ACCEPTED", acceptedByUserId: user.id, acceptedAt: new Date() },
  });
  if (claimed.count === 0) {
    // Distinguish a transient "someone else's acceptance is still being
    // resolved" window (challenge already ACCEPTED but no Battle yet)
    // from a genuinely terminal state, so the client can retry once
    // instead of treating every miss as final — Quick Match hits this
    // window far more often than the single-recipient Battle-accept
    // route does, since N-1 simultaneous losing attempts are the normal
    // case here, not an edge case.
    const current = await prisma.quickMatchChallenge.findUnique({ where: { id } });
    if (current?.status === "ACCEPTED" && !current.battleId) {
      return NextResponse.json({ error: "This challenge is being accepted — try again in a moment." }, { status: 423 });
    }
    return NextResponse.json({ error: "This challenge is no longer available." }, { status: 409 });
  }

  let battleId: string;
  try {
    ({ battleId } = await resolveQuickMatchAcceptance(challenge, user.id));
  } catch (err) {
    // resolveQuickMatchAcceptance's transaction is all-or-nothing, so
    // nothing partial needs undoing except the standalone status-flip
    // claimed just above it — reopen the challenge for other pending
    // recipients (or close it out with a refund if time ran out in the
    // meantime; see recoverFailedAccept's own doc comment). Safe to do
    // unconditionally here specifically because nothing in this branch
    // ever committed a Battle.
    await recoverFailedAccept(id, challenge.expiresAt.getTime() > Date.now());
    if (err instanceof InsufficientWalletBalanceError) {
      return NextResponse.json({ error: "Insufficient wallet balance to match this stake." }, { status: 402 });
    }
    throw err;
  }

  // A real Battle now exists and the challenge is resolved — a failure
  // from here on must NOT call recoverFailedAccept (that would reopen a
  // challenge that already has a committed Battle behind it, and another
  // recipient winning it would then create a second, conflicting Battle
  // for the same challenge). createBattleMatch's own matchCode-collision
  // retry makes this failure mode vanishingly unlikely; if it does happen,
  // this needs staff attention, not a silent client-side retry — same
  // "mark it, make it observable" discipline as the payout route's own
  // FAILED-marking on an equivalent rare failure.
  try {
    const battle = await prisma.battle.findUniqueOrThrow({ where: { id: battleId } });
    const match = await createBattleMatch(battle, user.id);

    const losers = await prisma.quickMatchRecipient.findMany({
      where: { challengeId: id, status: "CANCELLED" },
      select: { recipientUserId: true },
    });
    await Promise.all([
      notify(challenge.hostId, "QUICK_MATCH_ACCEPTED", { challengeId: id, battleId, opponentHandle: user.handle }),
      notify(challenge.hostId, "MATCH_READY", { matchId: match.id }),
      notify(user.id, "MATCH_READY", { matchId: match.id }),
      ...losers.map((l) => notify(l.recipientUserId, "QUICK_MATCH_UNAVAILABLE", { challengeId: id })),
    ]);
    trackEvent("quick_match_accepted", { userId: user.id, matchId: match.id, amountMinor: challenge.stakeAmount });

    return NextResponse.json({ battleId, matchId: match.id }, { status: 201 });
  } catch (err) {
    captureException(err, { source: "quick-match/[id]/accept", challengeId: id, battleId });
    return NextResponse.json(
      { error: "Your Quick Match was accepted but the match couldn't be created. Contact support." },
      { status: 500 }
    );
  }
}
