/** Circuit — delete a tournament update (its organizer, or Circuit staff). */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { deleteTournamentUpdate, UpdateError } from "@/lib/tournamentUpdates";

const STATUS = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400 } as const;

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; updateId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { id, updateId } = await params;
  try {
    await deleteTournamentUpdate({ updateId, tournamentId: id, actor: { id: user.id, isStaff: user.isStaff } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UpdateError) return NextResponse.json({ error: err.message }, { status: STATUS[err.code] });
    throw err;
  }
}
