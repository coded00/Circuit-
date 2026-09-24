/**
 * Circuit — a recipient's poll for "do I have an incoming Quick Match
 * right now" (src/components/QuickMatchIncomingListener.tsx). Returns at
 * most one challenge — a recipient with multiple simultaneous pending
 * invites just sees the most recent one; accepting it doesn't auto-clear
 * the others (they'll individually fail their own busy-check at accept
 * time once a real Match exists).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const recipientRow = await prisma.quickMatchRecipient.findFirst({
    where: { recipientUserId: user.id, status: "PENDING", challenge: { status: "PENDING" } },
    orderBy: { sentAt: "desc" },
    include: { challenge: { include: { host: { select: { displayName: true, handle: true } } } } },
  });

  if (!recipientRow || recipientRow.challenge.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ challenge: null });
  }

  return NextResponse.json({
    challenge: {
      id: recipientRow.challenge.id,
      game: recipientRow.challenge.game,
      format: recipientRow.challenge.format,
      stakeAmount: recipientRow.challenge.stakeAmount,
      expiresAt: recipientRow.challenge.expiresAt,
      hostDisplayName: recipientRow.challenge.host.displayName,
      hostHandle: recipientRow.challenge.host.handle,
    },
  });
}
