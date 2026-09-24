/**
 * Circuit — host cancels a still-pending Quick Match. Only possible before
 * anyone accepts (see src/lib/quickMatch.ts's cancelQuickMatchChallenge) —
 * once accepted, a real Battle exists and normal Battle-cancellation rules
 * take over instead.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { notify } from "@/lib/notifications";
import { trackEvent } from "@/lib/analytics";
import { logAdminAction } from "@/lib/auditLog";
import { ChallengeUnavailableError, cancelQuickMatchChallenge } from "@/lib/quickMatch";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const challenge = await prisma.quickMatchChallenge.findUnique({
    where: { id },
    include: { host: { select: { handle: true } } },
  });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }
  if (challenge.hostId !== user.id && !user.isStaff) {
    return NextResponse.json({ error: "Only the host can cancel this Quick Match." }, { status: 403 });
  }

  try {
    await cancelQuickMatchChallenge(id, challenge.hostId);
  } catch (err) {
    if (err instanceof ChallengeUnavailableError) {
      return NextResponse.json(
        { error: "This Quick Match has already been accepted, expired, or was already cancelled." },
        { status: 409 }
      );
    }
    throw err;
  }

  const recipients = await prisma.quickMatchRecipient.findMany({
    where: { challengeId: id, status: "CANCELLED" },
    select: { recipientUserId: true },
  });
  await Promise.all(
    recipients.map((r) =>
      notify(r.recipientUserId, "QUICK_MATCH_CANCELLED", { challengeId: id, hostHandle: challenge.host.handle })
    )
  );
  trackEvent("quick_match_cancelled", { userId: challenge.hostId, game: challenge.game });

  if (user.isStaff && challenge.hostId !== user.id) {
    await logAdminAction({
      actorId: user.id,
      action: "quickMatch.cancel",
      targetType: "QuickMatchChallenge",
      targetId: id,
      metadata: { game: challenge.game },
    });
  }

  return NextResponse.json({ ok: true });
}
