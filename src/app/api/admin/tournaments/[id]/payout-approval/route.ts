/**
 * Circuit — staff approval of a tournament's payout. Until a tournament is approved, its prizes can't be
 * claimed and the organizer's share isn't released. Approving means a person has looked at the results and
 * at the money actually collected (src/lib/payoutReview.ts) and found nothing that should hold it back.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { approveTournamentPayout } from "@/lib/payoutApproval";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const result = await approveTournamentPayout({ tournamentId: id, actorId: auth.user.id, note });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ approved: true });
}

/** Withdraws an approval, but only while no money has been paid out because of it. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const admin = auth.user;

  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true, payoutApprovedAt: true } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  if (!tournament.payoutApprovedAt) return NextResponse.json({ error: "This payout isn't approved." }, { status: 409 });

  const moved = await prisma.escrowTransaction.count({
    where: {
      tournamentId: id,
      OR: [{ type: "PRIZE_PAYOUT", status: { in: ["PENDING", "COMPLETE"] } }, { type: "ORGANIZER_REVENUE", status: "COMPLETE" }],
    },
  });
  if (moved > 0) return NextResponse.json({ error: "Money has already been paid out for this tournament, so the approval can't be withdrawn." }, { status: 409 });

  await prisma.tournament.update({ where: { id }, data: { payoutApprovedAt: null, payoutApprovedById: null, payoutApprovalNote: "Approval withdrawn by staff. Needs staff review." } }); // the note also keeps the sweep from approving it again
  await logAdminAction({ actorId: admin.id, action: "tournament.revokePayoutApproval", targetType: "Tournament", targetId: id, metadata: { name: tournament.name } });
  return NextResponse.json({ approved: false });
}
