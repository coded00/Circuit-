/** Circuit — appeal a suspension: POST { kind: ACCOUNT_SUSPENSION | COMMUNITY_SUSPENSION, communityId?, message }. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { fileAppeal } from "@/lib/appeals";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  try {
    await fileAppeal(user, await jsonBody(request));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
