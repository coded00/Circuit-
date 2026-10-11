/**
 * Circuit — settle a final Daily Challenge now instead of waiting for the next sweep. Same function the sweep runs, so
 * the same rules apply: it won't settle before the standings are final, will wait for a required approval, and pays each
 * prize exactly once however many times it is pressed. Staff only.
 */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { settleChallenge } from "@/lib/challengeSettlement";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { id } = await params;

  const r = await settleChallenge({ challengeId: id, actorId: auth.user.id });
  switch (r.status) {
    case "SETTLED":
      return NextResponse.json({ ok: true, awarded: r.awarded, house: r.house, note: r.note });
    case "WAITING_FOR_APPROVAL":
      return NextResponse.json({ error: "This payout needs a named approval first." }, { status: 409 });
    case "ALREADY_SETTLED":
      return NextResponse.json({ error: "This challenge is already settled." }, { status: 409 });
    case "NOT_READY":
      return NextResponse.json({ error: "The standings aren't final yet." }, { status: 409 });
    case "FAILED":
      return NextResponse.json({ error: r.error }, { status: 500 });
  }
}
