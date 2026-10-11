/** Circuit — "pick your games": POST { gameIds } joins those games' official hubs. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { joinGameHubs } from "@/lib/communityDirectory";
import { jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = await jsonBody(request);
  const gameIds = Array.isArray(body.gameIds) ? body.gameIds.filter((v): v is string => typeof v === "string") : [];
  if (gameIds.length === 0) return NextResponse.json({ error: "Pick at least one game." }, { status: 400 });
  const joined = await joinGameHubs(user.id, gameIds);
  return NextResponse.json({ joined });
}
