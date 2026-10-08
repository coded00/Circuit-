/**
 * Circuit — closing a repeated-pair flag (src/lib/stakePatterns.ts).
 *
 * The only write a person makes to a StakePatternFlag, and deliberately the
 * only one: the sweep owns every other field, because the evidence has to
 * stay a measurement rather than something a reviewer edits into something
 * they'd rather have seen.
 *
 * DISMISSED and ACTIONED are the whole vocabulary. There is no "escalated"
 * and no "reviewed" — a flag is already in front of staff the moment it
 * exists, and what happens next is either "nothing here" or "something was
 * done about it". The something itself (a suspension, a conversation) is a
 * separate action with its own route and its own audit entry; this records
 * that a flag was closed and why.
 *
 * Closing it also frees the pair: the unique index only covers OPEN flags,
 * so a pair that keeps going after being cleared opens a fresh flag, with
 * this row and this note still on the record. That is the point of
 * dismissing rather than deleting.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

const VALID_STATUSES = ["DISMISSED", "ACTIONED"];
const MAX_NOTE_LENGTH = 1000;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const staff = staffAuth.user;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const status = typeof body?.status === "string" ? body.status : "";
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Status must be DISMISSED or ACTIONED." }, { status: 400 });
  }

  const rawNote = typeof body?.note === "string" ? body.note.trim() : "";
  if (rawNote.length > MAX_NOTE_LENGTH) {
    return NextResponse.json({ error: `Keep the note under ${MAX_NOTE_LENGTH} characters.` }, { status: 400 });
  }
  // An ACTIONED flag with no note is a closed door with nothing behind it —
  // the next person to see this pair gets a row that says someone did
  // something and no way to find out what. Dismissing needs no note; acting
  // does.
  if (status === "ACTIONED" && !rawNote) {
    return NextResponse.json({ error: "Say what was done before closing this as actioned." }, { status: 400 });
  }

  const flag = await prisma.stakePatternFlag.findUnique({
    where: { id },
    select: { id: true, status: true, userAId: true, userBId: true, netKobo: true, battleCount: true },
  });
  if (!flag) return NextResponse.json({ error: "Flag not found." }, { status: 404 });
  if (flag.status !== "OPEN") {
    return NextResponse.json({ error: "That flag has already been closed." }, { status: 409 });
  }

  // Conditional update, not a read-then-write: two staff opening the same
  // flag at once is a real thing, and the second one's answer shouldn't
  // silently overwrite the first's. Only the call that flips it from OPEN
  // gets to record what happened.
  const closed = await prisma.stakePatternFlag.updateMany({
    where: { id, status: "OPEN" },
    data: {
      status,
      reviewedById: staff.id,
      reviewNote: rawNote || null,
      reviewedAt: new Date(),
    },
  });
  if (closed.count === 0) {
    return NextResponse.json({ error: "Someone else just closed that flag." }, { status: 409 });
  }

  await logAdminAction({
    actorId: staff.id,
    action: "stakePattern.review",
    targetType: "StakePatternFlag",
    targetId: id,
    metadata: {
      status,
      note: rawNote || null,
      userAId: flag.userAId,
      userBId: flag.userBId,
      battleCount: flag.battleCount,
      netKobo: flag.netKobo,
    },
  });

  return NextResponse.json({ status });
}
