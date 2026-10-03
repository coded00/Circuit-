/**
 * Circuit — Feed (Circuit Video Feed). This route used to be the
 * Leaderboard; that real, data-backed feature moved to `/leaderboard`
 * verbatim rather than being discarded — see that page's own header
 * comment. `/ladder` itself is now the primary nav's "Feed" destination
 * (not "Games" — it's short-form video, not a game browser): a
 * full-screen feed mixing Circuit-managed clips with curated official
 * YouTube channels (`src/lib/youtube-channels.ts`), no creator uploads.
 *
 * Server component's only job is the first page of data + the current
 * user/game list; all scrolling/autoplay/interaction state lives in the
 * client-side `FeedClient`.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getFeedPage, distinctFeedGames, FEED_PAGE_SIZE } from "@/lib/videos";
import { FeedClient, FEED_VIEWPORT_CLASS } from "@/components/video-feed/FeedClient";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Feed",
  description: "Short-form gaming clips, highlights, and news | Circuit tournaments and official channels in one feed.",
  path: "/ladder",
});

export default async function FeedPage() {
  const user = await getCurrentUser();
  const [{ videos, nextCursor, seed }, games] = await Promise.all([
    getFeedPage({ tab: "for-you", take: FEED_PAGE_SIZE, userId: user?.id ?? null }),
    distinctFeedGames(),
  ]);

  return (
    <div className={`relative ${FEED_VIEWPORT_CLASS}`}>
      {/* The full-screen video feed has no header, so this is the way back to Activity. */}
      <Link
        href="/activity"
        className="absolute top-3 left-3 z-20 cut-xs bg-black/55 px-3.5 py-1.5 text-[13px] font-semibold text-white backdrop-blur-sm transition hover:bg-black/70"
      >
        ← Activity
      </Link>
      <FeedClient
        initialVideos={videos}
        initialNextCursor={nextCursor}
        initialSeed={seed}
        games={games}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}
