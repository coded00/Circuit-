/**
 * Circuit — withdrawal & refund (Build Plan P2-4, maps: REG-4).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getPaymentProvider } from "@/lib/payments";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { tournament: true, escrowTxns: true },
  });

  if (!registration || registration.userId !== user.id) {
    return NextResponse.json({ error: "Registration not found." }, { status: 404 });
  }
  if (registration.status === "WITHDRAWN" || registration.status === "REFUNDED") {
    return NextResponse.json({ error: "Already withdrawn." }, { status: 409 });
  }
  if (new Date() >= registration.tournament.registrationCloseAt) {
    return NextResponse.json(
      { error: "Registration has closed — you can no longer withdraw." },
      { status: 409 }
    );
  }

  // Known gap, accepted for V1: withdrawing a still-PENDING_PAYMENT
  // registration just marks it WITHDRAWN with no refund attempt, since
  // there's nothing charged yet to refund. If the provider's charge
  // actually completes moments later — a race with this request —
  // confirmEntryFeePayment's idempotency check sees a non-PENDING_PAYMENT
  // registration and no-ops, so money is taken with no compensating
  // refund. Closing this needs a reconciliation job V1 doesn't have yet.
  const paidEntryFeeTxn = registration.escrowTxns.find(
    (txn) => txn.type === "ENTRY_FEE" && txn.status === "COMPLETE"
  );

  if (registration.status === "CONFIRMED" && paidEntryFeeTxn) {
    const provider = getPaymentProvider(paidEntryFeeTxn.provider);
    const refund = await provider.refundCharge(paidEntryFeeTxn.providerRef!, paidEntryFeeTxn.amount);

    await prisma.$transaction([
      prisma.registration.update({ where: { id: registration.id }, data: { status: "REFUNDED" } }),
      prisma.escrowTransaction.create({
        data: {
          tournamentId: registration.tournamentId,
          registrationId: registration.id,
          type: "REFUND",
          amount: paidEntryFeeTxn.amount,
          provider: paidEntryFeeTxn.provider,
          providerRef: refund.providerReference,
          status: refund.status === "SUCCESS" ? "COMPLETE" : "PENDING",
        },
      }),
    ]);
  } else {
    await prisma.registration.update({
      where: { id: registration.id },
      data: { status: "WITHDRAWN" },
    });
  }

  return NextResponse.json({ ok: true });
}
