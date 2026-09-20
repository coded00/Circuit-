"use client";

/**
 * Circuit Video Feed — client shell: tab bar, vertical snap-scroll
 * container, infinite pagination, and the single-active-video decision
 * every `VideoCard` defers to. Kept deliberately light: no video library,
 * no state-management dependency — a handful of `useState`/`useRef` and
 * the browser's own `IntersectionObserver`/scroll-snap.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { VideoCard } from "./VideoCard";
import { FeedSkeleton } from "./FeedSkeleton";
import type { FeedTab, FeedVideo } from "@/lib/videos";

const TABS: { key: FeedTab; label: string }[] = [
  { key: "for-you", label: "For You" },
  { key: "trending", label: "Trending" },
  { key: "games", label: "Games" },
  { key: "following", label: "Following" },
];

const MUTE_KEY = "circuit-feed-muted";

/** The exact "fill the space between the top bar and (on mobile) the
 *  bottom tab bar" height every page embedding `FeedClient` needs on its
 *  own wrapper div. `AppShell`'s topbar is 60px; the mobile tab bar is a
 *  single `3.5rem + safe-area` row on every route except `/dashboard`
 *  (which briefly shows a second row above it — see `MobileTabBar`'s own
 *  comment) — not the `7rem` the app shell's ancestor grid reserves
 *  as a worst-case for that dashboard case, which would leave a visible
 *  gap of dead space below the feed on every other route. */
export const FEED_VIEWPORT_CLASS = "h-[calc(100dvh-60px-3.5rem-env(safe-area-inset-bottom))] w-full sm:h-[calc(100dvh-60px)]";

export function FeedClient({
  initialVideos,
  initialNextCursor,
  initialSeed,
  initialTab = "for-you",
  initialGame,
  games,
  currentUserId,
}: {
  initialVideos: FeedVideo[];
  initialNextCursor: string | null;
  /** Seeds the server's diversity shuffle (see `lib/videos.ts`'s own
   *  comment) — carried along on every pagination request for this same
   *  view so page 2+ keeps slicing the same shuffled order page 1 used,
   *  instead of the feed re-shuffling (and duplicating/skipping videos)
   *  on every request. A tab or game switch gets a new one from the
   *  server, which is the point: that's a fresh view, and it's also what
   *  makes reloading the page start somewhere different each time. */
  initialSeed: string;
  initialTab?: FeedTab;
  initialGame?: string;
  games: string[];
  currentUserId: string | null;
}) {
  const [tab, setTab] = useState<FeedTab>(initialTab);
  const [game, setGame] = useState<string | undefined>(initialGame);
  const [videos, setVideos] = useState(initialVideos);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [seed, setSeed] = useState(initialSeed);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState(false);
  // Always starts `true` — identical on server and client so hydration
  // has nothing to mismatch on (a session's stored preference can only be
  // known client-side, so branching the initial value on it here would
  // literally be the `typeof window !== "undefined"` anti-pattern React's
  // own hydration-mismatch warning calls out). The one-time read below
  // corrects it right after mount, before the viewer can act on the page.
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const stored = sessionStorage.getItem(MUTE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-time post-mount correction from sessionStorage (see comment above), not a data-fetch/subscription effect
    if (stored !== null) setMuted(stored === "1");
  }, []);
  const [activeId, setActiveId] = useState<string | null>(initialVideos[0]?.id ?? null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const ratiosRef = useRef<Map<string, number>>(new Map());
  // Read inside the stable `onVisibilityChange` callback below so pagination
  // can react to fresh state without that callback's identity changing on
  // every keystroke of state (which would tear down/recreate every child
  // VideoCard's IntersectionObserver each render).
  const videosRef = useRef(videos);
  const nextCursorRef = useRef(nextCursor);
  const loadingRef = useRef(loading);
  const tabRef = useRef(tab);
  const gameRef = useRef(game);
  const seedRef = useRef(seed);
  // Refs are written outside of render (React's own sanctioned pattern for
  // "keep a mutable value in sync") so `onVisibilityChange` below can stay
  // referentially stable while still reading fresh state.
  useEffect(() => {
    videosRef.current = videos;
    nextCursorRef.current = nextCursor;
    loadingRef.current = loading;
    tabRef.current = tab;
    gameRef.current = game;
    seedRef.current = seed;
  });

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      sessionStorage.setItem(MUTE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Fetches the next page in response to scroll position — called from
  // `onVisibilityChange` below, itself a callback the browser's own
  // IntersectionObserver invokes (an external-system subscription, the
  // pattern the "no setState directly in an effect body" rule wants:
  // https://react.dev/learn/you-might-not-need-an-effect).
  const fetchNextPage = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor || loadingRef.current) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab: tabRef.current, cursor, seed: seedRef.current });
      if (gameRef.current) params.set("game", gameRef.current);
      const res = await fetch(`/api/videos/feed?${params.toString()}`);
      if (!res.ok) throw new Error("feed request failed");
      const data = await res.json();
      setVideos((prev) => [...prev, ...data.videos]);
      setNextCursor(data.nextCursor);
    } catch {
      // A failed background page fetch shouldn't blow away the videos
      // already loaded and playing — just stop; the next scroll retries.
    } finally {
      setLoading(false);
    }
  }, []);

  const onVisibilityChange = useCallback(
    (id: string, ratio: number) => {
      ratiosRef.current.set(id, ratio);
      let bestId: string | null = null;
      let bestRatio = 0.5; // require majority visibility before anything counts as "active"
      for (const [vid, r] of ratiosRef.current) {
        if (r > bestRatio) {
          bestRatio = r;
          bestId = vid;
        }
      }
      if (!bestId) return;
      setActiveId(bestId);

      const activeIndex = videosRef.current.findIndex((v) => v.id === bestId);
      if (activeIndex !== -1 && activeIndex >= videosRef.current.length - 2) {
        fetchNextPage();
      }
    },
    [fetchNextPage]
  );

  // Deliberately never sends the current seed — a tab/game switch (or a
  // retry after an error) is a fresh view, and getting a new seed back is
  // exactly what makes it reshuffle instead of resuming the old order.
  const loadFeed = useCallback(async (nextTab: FeedTab, nextGame: string | undefined, reset: boolean) => {
    setError(false);
    if (reset) setInitialLoading(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ tab: nextTab });
      if (nextGame) params.set("game", nextGame);
      const res = await fetch(`/api/videos/feed?${params.toString()}`);
      if (!res.ok) throw new Error("feed request failed");
      const data = await res.json();
      setVideos(data.videos);
      setNextCursor(data.nextCursor);
      setSeed(data.seed);
      ratiosRef.current = new Map();
      setActiveId(data.videos[0]?.id ?? null);
      scrollRef.current?.scrollTo({ top: 0 });
    } catch {
      setError(true);
    } finally {
      setInitialLoading(false);
      setLoading(false);
    }
  }, []);

  function selectTab(nextTab: FeedTab) {
    if (nextTab === tab) return;
    setTab(nextTab);
    const nextGame = nextTab === "games" ? game : undefined;
    if (nextTab !== "games") setGame(undefined);
    loadFeed(nextTab, nextGame, true);
  }

  function selectGame(nextGame: string) {
    setGame(nextGame || undefined);
    loadFeed("games", nextGame || undefined, true);
  }

  return (
    <div className="flex h-full w-full flex-col bg-black">
      <div className="scrollbar-hide flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-black px-4 py-2.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              tab === t.key ? "bg-accent-volt text-accent-volt-foreground" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
        {tab === "games" && games.length > 0 && (
          <select
            value={game ?? ""}
            onChange={(e) => selectGame(e.target.value)}
            className="ml-1 shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white"
          >
            <option value="">All games</option>
            {games.map((g) => (
              <option key={g} value={g} className="text-foreground">
                {g}
              </option>
            ))}
          </select>
        )}
      </div>

      <div ref={scrollRef} className="scrollbar-hide relative flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain">
        {initialLoading ? (
          <FeedSkeleton />
        ) : error ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-white">
            <span className="font-display text-lg font-bold tracking-tight uppercase">Feed Interrupted</span>
            <p className="text-sm text-white/70">We couldn&apos;t load the latest drops.</p>
            <button type="button" onClick={() => loadFeed(tab, game, true)} className="btn-primary mt-2 flex items-center gap-2">
              <RefreshCw size={14} />
              Try Again
            </button>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-white">
            {tab === "following" && !currentUserId ? (
              <>
                <span className="font-display text-lg font-bold tracking-tight uppercase">Log In To See This</span>
                <p className="text-sm text-white/70">Following shows drops for your favorite games — sign in to set them.</p>
              </>
            ) : tab === "following" ? (
              <>
                <span className="font-display text-lg font-bold tracking-tight uppercase">No Favorite Games Yet</span>
                <p className="text-sm text-white/70">Add favorite games on your profile to see them here.</p>
              </>
            ) : (
              <>
                <span className="font-display text-lg font-bold tracking-tight uppercase">No Drops Yet</span>
                <p className="text-sm text-white/70">New gaming content is loading into Circuit. Check back soon.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {videos.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                isActive={v.id === activeId}
                muted={muted}
                onToggleMute={toggleMute}
                onVisibilityChange={onVisibilityChange}
                currentUserId={currentUserId}
                preload={v.id === activeId ? "auto" : "none"}
              />
            ))}
            {!nextCursor && (
              <div className="flex h-full w-full shrink-0 snap-start flex-col items-center justify-center gap-2 px-6 text-center text-white">
                <span className="font-display text-lg font-bold tracking-tight uppercase">You&apos;ve Reached The End</span>
                <p className="text-sm text-white/70">Check back soon for new drops.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
