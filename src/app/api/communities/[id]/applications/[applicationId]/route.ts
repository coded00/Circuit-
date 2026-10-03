/** Circuit — a moderator approves or rejects an application: PATCH { approve }. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { reviewApplication } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function PATCH(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { applicationId } = await params;
  const body = await jsonBody(request);
  if (typeof body.approve !== "boolean") return NextResponse.json({ error: "approve (boolean) is required." }, { status: 400 });
  try {
    await reviewApplication(applicationId, user, body.approve);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
