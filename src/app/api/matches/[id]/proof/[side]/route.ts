/**
 * Circuit — proof file serving (Build Plan P0-5/NFR-4, wired up for P3-4).
 *
 * The client never sees the storage ref — matchId + side (a|b) is all a
 * caller needs; this route resolves that to the actual proofARef/proofBRef
 * server-side after checking access against the real Match row, not
 * anything decoded from client input.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canAccessProof, proofStorage } from "@/lib/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; side: string }> }
) {
  const { id, side } = await params;
  if (side !== "a" && side !== "b") {
    return NextResponse.json({ error: "Invalid proof side." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const match = await prisma.match.findUnique({
    where: { id },
    include: { tournament: { select: { organizerId: true } }, dispute: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const isOrganizerCurrentlyRuling =
    match.tournament?.organizerId === user.id && match.dispute?.status === "ORGANIZER_REVIEW";

  const allowed = canAccessProof({
    requestingUserId: user.id,
    match: { playerAId: match.playerAId, playerBId: match.playerBId },
    isStaff: user.isStaff,
    isOrganizerCurrentlyRuling,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const ref = side === "a" ? match.proofARef : match.proofBRef;
  if (!ref) {
    return NextResponse.json({ error: "No proof uploaded for this side." }, { status: 404 });
  }

  const { buffer, contentType } = await proofStorage.read(ref);
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": contentType } });
}
