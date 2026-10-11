/**
 * Circuit — enter a Daily Challenge. The money (wallet debit, fee split, ledger rows) and every rule are in
 * enterChallenge; this route only identifies the player and applies the one gate that needs the request: a verified
 * email before real money moves, as for paid tournament entry.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { emailVerificationRequired } from "@/lib/emailGate";
import { enterChallenge } from "@/lib/dailyChallengeEntries";
import { challengeErrorResponse } from "@/lib/dailyChallengeHttp";
import { noWinnerNotice } from "@/lib/challengeDisclosure";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to enter a challenge." }, { status: 401 });
  const { id } = await params;

  const challenge = await prisma.dailyChallenge.findUnique({
    where: { id },
    select: { entryFee: true, noWinnerPolicy: true, minScore: true, requirements: { select: { gate: true } } },
  });
  if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });

  // Where the entry fee can be kept if nobody qualifies, the player has to have agreed to that before they are charged —
  // checked here, not just by the button, so a request that skips the page can't skip the agreement.
  const notice = noWinnerNotice({ policy: challenge.noWinnerPolicy, hasMandatoryTarget: challenge.minScore !== null || challenge.requirements.some((r) => r.gate), entryFee: challenge.entryFee });
  if (notice) {
    const body = await request.json().catch(() => null);
    if (!body || body.acknowledged !== true) {
      return NextResponse.json({ error: `Please confirm you understand: ${notice}`, code: "NOT_ACKNOWLEDGED" }, { status: 400 });
    }
  }
  if (challenge.entryFee > 0) {
    const unverified = emailVerificationRequired(user);
    if (unverified) return unverified;
  }

  try {
    const { entryId } = await enterChallenge({ userId: user.id, challengeId: id });
    return NextResponse.json({ entryId }, { status: 201 });
  } catch (err) {
    return challengeErrorResponse(err);
  }
}
