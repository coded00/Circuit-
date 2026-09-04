/**
 * Circuit — registration (Build Plan P2-1/P2-2/P2-3, maps: REG-1, REG-2, REG-3).
 *
 * Free and paid tournaments fork here: a free entry confirms immediately
 * (there's no payment to wait on); a paid entry is created PENDING_PAYMENT
 * and handed a hosted-checkout URL — it only ever becomes CONFIRMED via
 * confirmEntryFeePayment (the webhook path), never directly in this route.
 *
 * REG-3's auto-close is enforced live here (deadline or cap) rather than
 * via a background sweep updating Tournament.status — see
 * docs/circuit-stack.md's Scheduled work section for why a periodic sweep
 * is still the right call once there's somewhere to run it (Vercel Cron);
 * until then, checking live at the write is equally correct, just without
 * the status field itself flipping to CLOSED in between.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getDefaultPaymentProvider } from "@/lib/payments";
import { maybeGenerateBracketOnCapFill } from "@/lib/matches";

function toCheckoutEmail(emailOrPhone: string, userId: string): string {
  // ACC-2 allows phone-only signup, but both payment providers' hosted
  // checkout requires an email. Not a real email inbox — just a stable,
  // provider-acceptable placeholder tied to the account.
  return emailOrPhone.includes("@") ? emailOrPhone : `${userId}@users.circuit.ng`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to register." },
      { status: 401 }
    );
  }

  const { id: tournamentId } = await params;
  const body = await request.json().catch(() => null);
  const inGameId = typeof body?.inGameId === "string" ? body.inGameId.trim() : "";
  if (!inGameId) {
    return NextResponse.json({ error: "In-game ID is required." }, { status: 400 });
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const now = new Date();
  if (tournament.status === "CANCELLED") {
    return NextResponse.json({ error: "This tournament has been cancelled." }, { status: 409 });
  }
  if (now < tournament.registrationOpenAt) {
    return NextResponse.json({ error: "Registration hasn't opened yet." }, { status: 409 });
  }
  if (now >= tournament.registrationCloseAt) {
    return NextResponse.json({ error: "Registration is closed." }, { status: 409 });
  }

  // Known gap, accepted for V1: this count-then-write isn't inside a
  // serializable transaction, so two concurrent requests landing on the
  // last open slot could both pass this check. Not worth a row lock at
  // V1's expected concurrency (docs/circuit-stack.md's minimal-infra
  // stance) — revisit if a real tournament ever actually oversells its cap.
  const confirmedCount = await prisma.registration.count({
    where: { tournamentId, status: "CONFIRMED" },
  });
  if (confirmedCount >= tournament.participantCap) {
    return NextResponse.json({ error: "Registration is full." }, { status: 409 });
  }

  const existing = await prisma.registration.findUnique({
    where: { tournamentId_userId: { tournamentId, userId: user.id } },
  });
  // Only an active registration blocks a retry — WITHDRAWN/REFUNDED (a
  // prior withdrawal) and PENDING_PAYMENT (an abandoned checkout) both
  // reuse the same row instead.
  if (existing?.status === "CONFIRMED") {
    return NextResponse.json(
      { error: "You're already registered for this tournament." },
      { status: 409 }
    );
  }

  if (tournament.entryFee === 0) {
    const registration = existing
      ? await prisma.registration.update({
          where: { id: existing.id },
          data: { inGameId, status: "CONFIRMED" },
        })
      : await prisma.registration.create({
          data: { tournamentId, userId: user.id, inGameId, status: "CONFIRMED" },
        });
    await maybeGenerateBracketOnCapFill(tournamentId); // BRK-1's cap-fill path
    return NextResponse.json(
      { id: registration.id, status: registration.status },
      { status: 201 }
    );
  }

  const registration = existing
    ? await prisma.registration.update({
        where: { id: existing.id },
        data: { inGameId, status: "PENDING_PAYMENT" },
      })
    : await prisma.registration.create({
        data: { tournamentId, userId: user.id, inGameId, status: "PENDING_PAYMENT" },
      });

  const reference = `reg_${registration.id}_${randomUUID().slice(0, 8)}`;
  const provider = getDefaultPaymentProvider();

  let chargeResult;
  try {
    chargeResult = await provider.initializeCharge({
      amount: tournament.entryFee,
      currency: "NGN",
      email: toCheckoutEmail(user.emailOrPhone, user.id),
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/tournaments/${tournamentId}/register/callback?ref=${reference}`,
      metadata: { tournamentId, userId: user.id },
    });
  } catch (err) {
    // Don't leave a fresh PENDING_PAYMENT row with no charge behind it —
    // only rolls back if we just created it (a reused row predates this
    // attempt and might still resolve from an earlier charge).
    if (!existing) {
      await prisma.registration.delete({ where: { id: registration.id } });
    }
    throw err;
  }

  await prisma.$transaction([
    prisma.registration.update({
      where: { id: registration.id },
      data: { paymentRef: reference },
    }),
    prisma.escrowTransaction.create({
      data: {
        tournamentId,
        registrationId: registration.id,
        type: "ENTRY_FEE",
        amount: tournament.entryFee,
        provider: provider.name,
        providerRef: reference,
        status: "PENDING",
      },
    }),
  ]);

  return NextResponse.json(
    {
      id: registration.id,
      status: "PENDING_PAYMENT",
      authorizationUrl: chargeResult.authorizationUrl,
    },
    { status: 201 }
  );
}
