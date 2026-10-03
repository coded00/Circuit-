/**
 * Circuit — withdrawal & refund (Build Plan P2-4, maps: REG-4).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { currentPaidEntryFee, issueEntryFeeRefund, voidEntryFeeRevenue } from "@/lib/payments/transfers";

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
      { error: "Registration has closed. You can no longer withdraw." },
      { status: 409 }
    );
  }
  // A bracket can finish well before the registration deadline passes
  // (byes and fast-resolving matches make this the common case, not an
  // edge case) — REG-4's own gate is "before registration closes," but
  // withdrawing after already playing (and possibly winning) a bracket
  // match makes no sense and was reachable without this check.
  if (registration.tournament.status === "LIVE" || registration.tournament.status === "COMPLETE") {
    return NextResponse.json(
      { error: "This tournament's bracket has already started. You can no longer withdraw." },
      { status: 409 }
    );
  }

  // Withdrawing a still-PENDING_PAYMENT registration just marks it
  // WITHDRAWN — nothing's been charged yet to refund. If the charge
  // completes afterwards, confirmEntryFeePayment sees a WITHDRAWN
  // registration with a paid fee and refunds it (from the webhook, or the
  // sweep's reconcilePendingMoney() if the webhook never comes).
  const paidEntryFeeTxn = currentPaidEntryFee(registration.escrowTxns);

  if (registration.status === "CONFIRMED" && paidEntryFeeTxn) {
    // Claim atomically BEFORE calling the payment provider — refundCharge
    // is the real-money-movement step, so the guard has to sit in front
    // of it, not just around the DB write afterward. A plain
    // read-then-write here (checked registration.status above, write
    // later) would still let two concurrent withdraw requests both pass
    // that read and both issue a real refund call to the provider before
    // either DB write lands — a double refund of the same entry fee.
    const claimed = await prisma.registration.updateMany({
      where: { id: registration.id, status: "CONFIRMED" },
      data: { status: "REFUNDED" },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Already withdrawn." }, { status: 409 });
    }

    try {
      await issueEntryFeeRefund({
        tournamentId: registration.tournamentId,
        registrationId: registration.id,
        provider: paidEntryFeeTxn.provider!, // always set for an ENTRY_FEE row
        chargeRef: paidEntryFeeTxn.providerRef!,
        amount: paidEntryFeeTxn.amount,
        notifyPlayer: true,
      });
      await voidEntryFeeRevenue(registration.id);
    } catch (err) {
      // The refund call itself threw (network/provider error) — nothing
      // confirmed to have left custody. Revert the claim so the player
      // isn't shown "withdrawn" with no refund actually in flight, and a
      // retry is possible.
      await prisma.registration.update({ where: { id: registration.id }, data: { status: "CONFIRMED" } });
      throw err;
    }
  } else {
    const claimed = await prisma.registration.updateMany({
      where: { id: registration.id, status: { notIn: ["WITHDRAWN", "REFUNDED"] } },
      data: { status: "WITHDRAWN" },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "Already withdrawn." }, { status: 409 });
    }
  }

  return NextResponse.json({ ok: true });
}
