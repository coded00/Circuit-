/**
 * Circuit — recording where a sponsored prize's money is coming from.
 *
 * The write side of TournamentSponsorship. One record per tournament, replaced rather than appended to, so
 * "the sponsorship" is always a single thing a reader can look up. A sponsored payout whose unbacked amount
 * isn't covered by this record cannot be approved by anyone (src/lib/sponsorship.ts), which is the point:
 * the approver's yes is a yes to a stated amount from a stated source.
 *
 * Any staff member may record it, including the organizer. That is deliberate and not a hole: the organizer
 * is exactly who knows where the money is coming from, and they still cannot approve the payout — that
 * needs a different staff member (payoutApproval.ts), who now has something specific to check. Requiring a
 * second person to do the recording as well would add a deadlock on a one-staff deployment without adding a
 * control, because the approver is already the second person.
 *
 * Refused once the payout is approved: an approval is a decision about a specific figure, and letting the
 * figure be rewritten underneath it would make the record describe something nobody approved.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { MAX_KOBO_COLUMN } from "@/lib/money";
import { MAX_SPONSORSHIP_SOURCE_LENGTH, MAX_SPONSORSHIP_NOTE_LENGTH } from "@/lib/sponsorship";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const staff = auth.user;

  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { id: true, name: true, payoutApprovedAt: true },
  });
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  if (tournament.payoutApprovedAt) {
    return NextResponse.json(
      { error: "This payout is already approved. Withdraw the approval first if the sponsorship has changed." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const amountKobo = Number(body.amountKobo);
  // Whole naira, strictly positive, inside what the column can hold. A record of zero is not a record —
  // leaving it out entirely is the honest way to say nothing is sponsoring this.
  if (!Number.isInteger(amountKobo) || amountKobo <= 0 || amountKobo % 100 !== 0) {
    return NextResponse.json({ error: "The sponsored amount must be a whole number of naira, more than zero." }, { status: 400 });
  }
  if (amountKobo > MAX_KOBO_COLUMN) {
    return NextResponse.json({ error: "That amount is larger than this system can record." }, { status: 400 });
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (!source) {
    return NextResponse.json({ error: "Say where the money is coming from." }, { status: 400 });
  }
  if (source.length > MAX_SPONSORSHIP_SOURCE_LENGTH) {
    return NextResponse.json({ error: `Keep the source under ${MAX_SPONSORSHIP_SOURCE_LENGTH} characters.` }, { status: 400 });
  }

  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (note && note.length > MAX_SPONSORSHIP_NOTE_LENGTH) {
    return NextResponse.json({ error: `Keep the note under ${MAX_SPONSORSHIP_NOTE_LENGTH} characters.` }, { status: 400 });
  }

  const record = await prisma.tournamentSponsorship.upsert({
    where: { tournamentId: id },
    create: { tournamentId: id, recordedById: staff.id, amountKobo, source, note },
    update: { recordedById: staff.id, amountKobo, source, note },
  });

  // The amount is on the audit row, not only the fact of the change: a sponsorship that was later raised
  // to cover a bigger prize is exactly the history someone would want, and "recorded a sponsorship" alone
  // would not show it.
  await logAdminAction({
    actorId: staff.id,
    action: "tournament.recordSponsorship",
    targetType: "Tournament",
    targetId: id,
    metadata: { name: tournament.name, amountKobo, source },
  });

  return NextResponse.json({ amountKobo: record.amountKobo, source: record.source });
}
