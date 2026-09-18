/**
 * Circuit Video Feed — feed pagination. Same cursor convention as
 * `/api/community/posts`: `take + 1` lookahead, `nextCursor` is the last
 * row's id or null once there's nothing left (feed section 20's "avoid
 * infinite API requests" — the client stops asking once this is null).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getFeedPage, FEED_PAGE_SIZE, type FeedTab } from "@/lib/videos";

const VALID_TABS: FeedTab[] = ["for-you", "trending", "games", "following"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tabParam = searchParams.get("tab");
  const tab: FeedTab = VALID_TABS.includes(tabParam as FeedTab) ? (tabParam as FeedTab) : "for-you";
  const game = searchParams.get("game") || undefined;
  const cursor = searchParams.get("cursor") || undefined;
  const seed = searchParams.get("seed") || undefined;

  const user = await getCurrentUser();

  const { videos, nextCursor, seed: resolvedSeed } = await getFeedPage({
    tab,
    game,
    cursor,
    take: FEED_PAGE_SIZE,
    userId: user?.id ?? null,
    seed,
  });

  return NextResponse.json({ videos, nextCursor, seed: resolvedSeed });
}
