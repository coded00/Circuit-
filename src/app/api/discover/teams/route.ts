/**
 * Circuit — "Load More" pagination for Discover Teams, same cursor shape
 * as /api/discover/players. Thin wrapper: all real logic lives in
 * getDiscoverableTeams (src/lib/teamDiscovery.ts).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getDiscoverableTeams } from "@/lib/teamDiscovery";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const filters = {
    q: searchParams.get("q") ?? undefined,
    game: searchParams.get("game") ?? undefined,
    region: searchParams.get("region") ?? undefined,
  };

  const { teams, nextCursor } = await getDiscoverableTeams({ viewerId: user.id, cursor, filters });

  return NextResponse.json({ teams, nextCursor });
}
