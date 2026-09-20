/**
 * Circuit — staff dispute ruling (Build Plan P6-2, maps: TRU-2).
 */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { MatchError, ruleDispute } from "@/lib/matches";

const STATUS_BY_CODE: Record<MatchError["code"], number> = {
  NOT_FOUND: 404,
  ALREADY_COMPLETE: 409,
  DISPUTED: 409,
  NOT_A_PARTICIPANT: 403,
  INVALID_WINNER: 400,
  ALREADY_RESOLVED: 409,
  NOT_ESCALATED: 409,
  NOT_ORGANIZER_REVIEW: 409,
  FORBIDDEN: 403,
  WINDOW_EXPIRED: 409,
  VOID_UNSUPPORTED: 409,
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const user = staffAuth.user;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const ruling = typeof body?.ruling === "string" ? body.ruling.trim() : "";
  if (!ruling) {
    return NextResponse.json({ error: "A short ruling explanation is required." }, { status: 400 });
  }

  try {
    const dispute = await ruleDispute({
      disputeId: id,
      rulingUserId: user.id,
      isStaffRuling: true,
      ruling,
      winnerId: typeof body?.winnerId === "string" ? body.winnerId : undefined,
      voidMatch: body?.voidMatch === true,
    });
    return NextResponse.json({ status: dispute.status });
  } catch (err) {
    if (err instanceof MatchError) {
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    }
    throw err;
  }
}
