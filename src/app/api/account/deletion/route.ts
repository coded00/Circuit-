/**
 * Circuit — ask for the account to be deleted, or take the request back.
 * POST { action: "request" | "cancel" }. A request is refused, with the
 * reasons, while money or competitions are still open; staff do the actual
 * deletion by hand. See src/lib/accountDeletion.ts.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { cancelAccountDeletion, requestAccountDeletion } from "@/lib/accountDeletion";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = await request.json().catch(() => null);

  if (body?.action === "cancel") {
    await cancelAccountDeletion(user.id);
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "request") {
    const result = await requestAccountDeletion(user);
    if (!result.ok) {
      return NextResponse.json({ error: "Sort these out first, then ask again.", reasons: result.reasons }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
