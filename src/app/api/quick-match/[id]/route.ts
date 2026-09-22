/**
 * Circuit — Quick Match status poll, driving the host's "Searching for an
 * opponent..." screen. Also where lazy expiry actually happens for most
 * challenges — see src/lib/quickMatch.ts's expireQuickMatchChallengeIfDue.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";
import { trackEvent } from "@/lib/analytics";
import { expireQuickMatchChallengeIfDue } from "@/lib/quickMatch";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  let challenge = await prisma.quickMatchChallenge.findUnique({ where: { id } });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }
  if (challenge.hostId !== user.id) {
    return NextResponse.json({ error: "Only the host can view this Quick Match's status." }, { status: 403 });
  }

  if (challenge.status === "PENDING" && challenge.expiresAt.getTime() < Date.now()) {
    const justExpired = await expireQuickMatchChallengeIfDue(id);
    if (justExpired) {
      await notify(user.id, "QUICK_MATCH_EXPIRED", { challengeId: id });
      trackEvent("quick_match_expired", { userId: user.id, game: challenge.game });
      challenge = await prisma.quickMatchChallenge.findUniqueOrThrow({ where: { id } });
    }
  }

  const [recipientCount, respondedCount] = await Promise.all([
    prisma.quickMatchRecipient.count({ where: { challengeId: id } }),
    prisma.quickMatchRecipient.count({ where: { challengeId: id, status: { not: "PENDING" } } }),
  ]);

  return NextResponse.json({
    id: challenge.id,
    status: challenge.status,
    game: challenge.game,
    format: challenge.format,
    stakeAmount: challenge.stakeAmount,
    expiresAt: challenge.expiresAt,
    battleId: challenge.battleId,
    recipientCount,
    respondedCount,
  });
}
