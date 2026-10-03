/** Circuit — RSVP to a community event: POST { status: "GOING" | "INTERESTED" | null }. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { setRsvp } from "@/lib/communityEvents";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  const body = await jsonBody(request);
  const status = body.status === "GOING" || body.status === "INTERESTED" ? body.status : null;
  try {
    return NextResponse.json(await setRsvp(id, user.id, status));
  } catch (err) {
    return handleCommunityError(err);
  }
}
