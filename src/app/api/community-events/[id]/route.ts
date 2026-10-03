/** Circuit — moderators cancel a community event: DELETE. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { cancelEvent } from "@/lib/communityEvents";
import { handleCommunityError } from "@/lib/communityHttp";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  try {
    await cancelEvent(id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
