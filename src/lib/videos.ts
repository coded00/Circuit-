/**
 * Circuit Video Feed — data layer (Phase 1: foundation).
 *
 * Kept separate from the feed's UI (per the product spec's architecture
 * rules: "keep content-source logic separate from presentation", "keep
 * feed ranking separate from UI"). Every query here only ever returns
 * `status: PUBLISHED` rows — draft/archived videos never reach the public
 * feed, deep-link page, or sitemap.
 *
 * Ranking (section 6 of the spec) is deliberately the lightweight
 * "foundation" version, not the full weighted Feed Score — that's Phase 5
 * ("Intelligence") work. For now:
 *   - "for-you"/"games"/"following" tabs: recency order, then a single
 *     adaptive-diversity pass so the same game doesn't repeat back-to-back
 *     when a less-recent video of a different game is available.
 *   - "trending": simple engagement ordering (likes + shares + views),
 *     no time-decay yet.
 */

import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Video } from "@prisma/client";

export const FEED_PAGE_SIZE = 8;

/** Cheap string hash → seed for `mulberry32`, so a caller can pass any
 *  opaque string (a UUID is what this file hands out, but the type only
 *  needs to be "some string") instead of this module dealing in numbers. */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return h;
}

/** Deterministic PRNG from a numeric seed — same seed always produces the
 *  same sequence, which is exactly what makes shuffled pagination work:
 *  page 2's request re-derives the *same* shuffled order page 1 used
 *  (same seed) and just slices further into it, instead of re-rolling a
 *  new random order that would duplicate/skip videos across pages. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type FeedTab = "for-you" | "trending" | "games" | "following";

const PUBLISHED_SELECT = {
  id: true,
  slug: true,
  source: true,
  title: true,
  description: true,
  videoUrl: true,
  thumbnailUrl: true,
  sourceUrl: true,
  sourceAuthor: true,
  game: true,
  tournamentId: true,
  tags: true,
  likes: true,
  views: true,
  shares: true,
  publishedAt: true,
  createdAt: true,
  tournament: { select: { id: true, name: true } },
} as const;

export type FeedVideo = {
  id: string;
  slug: string;
  source: "CIRCUIT" | "YOUTUBE";
  title: string;
  description: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  game: string | null;
  tournamentId: string | null;
  tags: string[];
  likes: number;
  views: number;
  shares: number;
  publishedAt: Date | null;
  createdAt: Date;
  tournament: { id: string; name: string } | null;
  likedByMe: boolean;
  savedByMe: boolean;
};

/** Round-robins across "kinds" instead of exhausting one before moving to
 *  the next — the spec's own example rotates through several different
 *  games/sources in a row, not just two. "Kind" is the real game when
 *  there is one, otherwise the source channel — a run of `game: null`
 *  YouTube news/highlight clips from the same channel is exactly the kind
 *  of repetition this is meant to catch, not just repeated games.
 *
 *  An earlier version of this only swapped a repeat with the *next*
 *  differing item it could find, which sounds right but only actually
 *  works when there are exactly two kinds in play: with 19 Xbox clips and
 *  22 PlayStation clips both bunched at the top of the recency order and
 *  every other channel further down, that greedy swap just ping-pongs
 *  between those two largest buckets forever and never reaches the rest.
 *  Grouping by kind and taking one from each bucket per round guarantees
 *  every kind gets seen before any of them repeats. Must run over the
 *  *whole* candidate pool, not a single fetched page — a page-sized
 *  window can be entirely one channel with nothing else to interleave
 *  against.
 *
 *  Bucket *order* is shuffled using the caller's seeded `rng` — otherwise
 *  this is entirely deterministic (same published rows in, same order
 *  out, every time), so every fresh page load started from the exact
 *  same first video. Each bucket's own internal order stays recency/
 *  trending-sorted; only which channel/game gets to go first, second,
 *  etc. in the round-robin changes, so a reload feels fresh without
 *  becoming "completely random" (the spec's own words) — newest-per-kind
 *  is still what surfaces earliest within that kind's turn. The rng is
 *  seeded (not plain `Math.random()`) so pagination stays consistent: the
 *  same seed reproduces the same shuffled order, so page 2 is really the
 *  continuation of page 1 instead of a re-shuffled, possibly-overlapping
 *  draw — see `getFeedPage`'s own seed handling. */
function diversify<T extends { game: string | null; sourceAuthor: string | null }>(videos: T[], rng: () => number): T[] {
  const kind = (v: T) => v.game ?? v.sourceAuthor ?? "circuit";
  const buckets = new Map<string, T[]>();
  for (const v of videos) {
    const k = kind(v);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(v);
    else buckets.set(k, [v]);
  }
  const bucketList = [...buckets.values()];
  for (let i = bucketList.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bucketList[i], bucketList[j]] = [bucketList[j], bucketList[i]];
  }
  const result: T[] = [];
  for (let round = 0; result.length < videos.length; round++) {
    for (const bucket of bucketList) {
      if (round < bucket.length) result.push(bucket[round]);
    }
  }
  return result;
}

async function attachViewerState(videos: Video[], userId: string | null): Promise<FeedVideo[]> {
  const likedIds = new Set<string>();
  const savedIds = new Set<string>();
  if (userId && videos.length > 0) {
    const ids = videos.map((v) => v.id);
    const [likes, saves] = await Promise.all([
      prisma.videoLike.findMany({ where: { userId, videoId: { in: ids } }, select: { videoId: true } }),
      prisma.videoSave.findMany({ where: { userId, videoId: { in: ids } }, select: { videoId: true } }),
    ]);
    likes.forEach((l) => likedIds.add(l.videoId));
    saves.forEach((s) => savedIds.add(s.videoId));
  }
  return videos.map((v) => ({
    ...(v as unknown as FeedVideo),
    likedByMe: likedIds.has(v.id),
    savedByMe: savedIds.has(v.id),
  }));
}

/** Upper bound on how much of the candidate set diversify() gets to see
 *  and reorder. Circuit's whole video catalog is nowhere near this at
 *  Phase 1/3 scale (a couple hundred rows at most) — this exists so the
 *  query stays bounded once it eventually isn't, not because it matters
 *  today. Revisit (real windowed diversity, not "the whole pool") once
 *  total published-video count approaches this figure for real. */
const DIVERSITY_POOL_CAP = 300;

export async function getFeedPage({
  tab,
  game,
  cursor,
  take = FEED_PAGE_SIZE,
  userId,
  seed,
}: {
  tab: FeedTab;
  game?: string;
  cursor?: string;
  take?: number;
  userId: string | null;
  /** Opaque string that seeds the diversity shuffle below. Omit it for a
   *  first load (a fresh one is generated and handed back for the caller
   *  to reuse); pass the same one back on every subsequent page request
   *  for that same feed view so pagination keeps slicing the *same*
   *  shuffled order instead of re-rolling a new one each request (which
   *  would duplicate/skip videos across pages). A tab or game switch is a
   *  new view — start over without a seed there too. */
  seed?: string;
}): Promise<{ videos: FeedVideo[]; nextCursor: string | null; seed: string }> {
  const where: Record<string, unknown> = { status: "PUBLISHED" as const };
  if (game) where.game = game;

  if (tab === "following") {
    if (!userId) return { videos: [], nextCursor: null, seed: seed ?? crypto.randomUUID() };
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { favoriteGames: true } });
    const favorites = user?.favoriteGames ?? [];
    if (favorites.length === 0) return { videos: [], nextCursor: null, seed: seed ?? crypto.randomUUID() };
    where.game = { in: favorites };
  }

  const orderBy =
    tab === "trending"
      ? [{ likes: "desc" as const }, { views: "desc" as const }, { id: "desc" as const }]
      : [{ createdAt: "desc" as const }, { id: "desc" as const }];

  const resolvedSeed = seed ?? crypto.randomUUID();
  const rng = mulberry32(hashSeed(resolvedSeed));

  // Diversity has to run over the whole ranked pool, not whatever single
  // page happens to get fetched — a channel/game with a long streak at
  // the top of the recency order has nothing different to swap with if
  // it's only ever handed an 8-item window (the bug that shipped: a run
  // of 19 same-channel videos with nothing else in view to interleave
  // with). Pagination becomes a plain offset into that reordered pool
  // instead of a DB cursor — cheap and correct at Circuit's real current
  // scale; the `cursor` param is still an opaque string to callers.
  const pool = await prisma.video.findMany({ where, orderBy, take: DIVERSITY_POOL_CAP, select: PUBLISHED_SELECT });
  const ordered = tab === "trending" ? pool : diversify(pool, rng);

  const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const page = ordered.slice(offset, offset + take);
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < ordered.length;

  const videos = await attachViewerState(page as unknown as Video[], userId);

  return { videos, nextCursor: hasMore ? String(nextOffset) : null, seed: resolvedSeed };
}

export const getVideoBySlug = cache(async (slug: string, userId: string | null): Promise<FeedVideo | null> => {
  const row = await prisma.video.findUnique({
    where: { slug, status: "PUBLISHED" },
    select: PUBLISHED_SELECT,
  });
  if (!row) return null;
  const [withState] = await attachViewerState([row as unknown as Video], userId);
  return withState;
});

export async function distinctFeedGames(): Promise<string[]> {
  const rows = await prisma.video.findMany({
    where: { status: "PUBLISHED", game: { not: null } },
    select: { game: true },
    distinct: ["game"],
    orderBy: { game: "asc" },
  });
  return rows.map((r) => r.game).filter((g): g is string => !!g);
}

export async function toggleLike(videoId: string, userId: string): Promise<{ liked: boolean; likes: number }> {
  const existing = await prisma.videoLike.findUnique({ where: { videoId_userId: { videoId, userId } } });
  if (existing) {
    const [, video] = await prisma.$transaction([
      prisma.videoLike.delete({ where: { videoId_userId: { videoId, userId } } }),
      prisma.video.update({ where: { id: videoId }, data: { likes: { decrement: 1 } } }),
    ]);
    return { liked: false, likes: video.likes };
  }
  const [, video] = await prisma.$transaction([
    prisma.videoLike.create({ data: { videoId, userId } }),
    prisma.video.update({ where: { id: videoId }, data: { likes: { increment: 1 } } }),
  ]);
  return { liked: true, likes: video.likes };
}

export async function toggleSave(videoId: string, userId: string): Promise<{ saved: boolean }> {
  const existing = await prisma.videoSave.findUnique({ where: { videoId_userId: { videoId, userId } } });
  if (existing) {
    await prisma.videoSave.delete({ where: { videoId_userId: { videoId, userId } } });
    return { saved: false };
  }
  await prisma.videoSave.create({ data: { videoId, userId } });
  return { saved: true };
}

export async function recordShare(videoId: string): Promise<void> {
  await prisma.video.update({ where: { id: videoId }, data: { shares: { increment: 1 } } }).catch(() => undefined);
}

export async function recordView(videoId: string): Promise<void> {
  await prisma.video.update({ where: { id: videoId }, data: { views: { increment: 1 } } }).catch(() => undefined);
}
