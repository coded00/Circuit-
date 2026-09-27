/** Circuit — moderators create a community event: POST { title, startsAt, endsAt?, location?, description? }. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createEvent } from "@/lib/communityEvents";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  try {
    const event = await createEvent(id, user, await jsonBody(request));
    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
