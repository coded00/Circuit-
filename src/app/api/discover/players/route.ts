/**
 * Circuit — "Load More" pagination for /discover, same cursor shape as
 * src/app/api/notifications/route.ts. Thin wrapper: all real logic lives
 * in getDiscoverablePlayers (src/lib/discovery.ts), shared with the
 * server-rendered first page so the query exists in exactly one place.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getDiscoverablePlayers } from "@/lib/discovery";

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

  const { players, nextCursor } = await getDiscoverablePlayers({ viewerId: user.id, cursor, filters });

  return NextResponse.json({ players, nextCursor });
}
