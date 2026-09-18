/**
 * Circuit Video Feed — YouTube Data API v3 client (Phase 3). Plain `fetch`
 * calls against the public REST API, no SDK dependency. Every call here
 * is read-only and uses an API key (not OAuth) — pulling public channel
 * uploads never requires signing into any account.
 *
 * Kept separate from the ingestion script and from `lib/videos.ts` (the
 * Circuit-side data layer) per the product spec's "keep content-source
 * logic separate from presentation" / "keep feed ranking separate from
 * UI" architecture rules — this file only knows how to talk to YouTube,
 * nothing about Prisma or the feed.
 */

const API_BASE = "https://www.googleapis.com/youtube/v3";

/** YouTube Shorts currently allows up to 3 minutes — this is the
 *  documented current ceiling (it was 60s for years; don't assume the
 *  old limit). Duration is the only reliable signal the public Data API
 *  exposes for "is this a Short" short of scraping the Shorts shelf. */
const MAX_SHORT_SECONDS = 180;

export type YouTubeShort = {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSeconds: number;
};

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set");
  return key;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return res.json() as Promise<T>;
}

/** ISO 8601 duration ("PT1M3S", "PT47S", "PT2H") → whole seconds. */
function parseIsoDuration(iso: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const [, h, m, s] = match;
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

/** Resolves a `@handle` or raw `UC...` channel id to that channel's
 *  "uploads" playlist id — the cheap (1-unit) way to list a channel's
 *  videos, instead of the 100-unit `search.list` endpoint. */
export async function getUploadsPlaylistId(handleOrId: string): Promise<string | null> {
  const isRawId = handleOrId.startsWith("UC");
  const param = isRawId ? `id=${encodeURIComponent(handleOrId)}` : `forHandle=${encodeURIComponent(handleOrId.replace(/^@/, ""))}`;
  const data = await getJson<{
    items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
  }>(`${API_BASE}/channels?part=contentDetails&${param}&key=${apiKey()}`);
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

/** Latest uploads from a playlist, filtered to short-form (<=3min). Two
 *  cheap calls: `playlistItems.list` (1 unit) for the recent video ids,
 *  then a single batched `videos.list` (1 unit for up to 50 ids) for the
 *  duration/snippet data needed to filter and store them. */
export async function listRecentShorts(playlistId: string, maxResults = 15): Promise<YouTubeShort[]> {
  const key = apiKey();
  const playlistData = await getJson<{
    items?: { contentDetails?: { videoId?: string } }[];
  }>(`${API_BASE}/playlistItems?part=contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=${maxResults}&key=${key}`);

  const videoIds = (playlistData.items ?? []).map((i) => i.contentDetails?.videoId).filter((id): id is string => !!id);
  if (videoIds.length === 0) return [];

  const videoData = await getJson<{
    items?: {
      id: string;
      snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
      contentDetails?: { duration?: string };
    }[];
  }>(`${API_BASE}/videos?part=snippet,contentDetails&id=${videoIds.join(",")}&key=${key}`);

  return (videoData.items ?? [])
    .map((item) => ({
      videoId: item.id,
      title: item.snippet?.title ?? "Untitled",
      description: item.snippet?.description ?? "",
      thumbnailUrl: item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
      publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
      durationSeconds: parseIsoDuration(item.contentDetails?.duration ?? "PT0S"),
    }))
    .filter((v) => v.durationSeconds > 0 && v.durationSeconds <= MAX_SHORT_SECONDS);
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/shorts/${videoId}`;
}

/** Extracts the 11-char video id from any watch/shorts/embed URL Circuit
 *  might have stored as `Video.sourceUrl` — the embed player needs the
 *  bare id, not the full URL. */
export function extractYouTubeId(url: string): string | null {
  const match = /(?:shorts\/|watch\?v=|embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(url);
  return match?.[1] ?? null;
}
