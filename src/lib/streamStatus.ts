/**
 * Circuit — is a stream live right now, and how many are watching? Asked of the platform that hosts it (Twitch's
 * Helix API, YouTube's Data API) and only when Circuit has been given that platform's keys: with no keys, or when a
 * platform doesn't answer, a channel simply has no status and Watch shows no badge. Nothing is ever guessed.
 *
 * Answers are cached for a short while, per channel, so the number of calls to a platform depends on how many
 * channels are being watched, not on how many people are watching.
 */
import type { StatusTarget } from "@/lib/streamEmbed";

export type StreamStatus = { live: boolean; viewers: number | null };

const TTL_MS = 30_000;
const TIMEOUT_MS = 3_000;
const cache = new Map<string, { at: number; status: StreamStatus }>();
let twitchToken: { value: string; expiresAt: number } | null = null;

const keyOf = (t: StatusTarget) => `${t.platform}:${t.id}`;

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

async function twitchAppToken(
  id: string,
  secret: string,
): Promise<string | null> {
  if (twitchToken && twitchToken.expiresAt > Date.now() + 60_000)
    return twitchToken.value;
  const res = await timedFetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;
  twitchToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

/** Twitch lists only the channels that are live; a channel missing from the answer is offline. */
async function fetchTwitch(
  logins: string[],
): Promise<Map<string, StreamStatus>> {
  const out = new Map<string, StreamStatus>();
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret || logins.length === 0) return out;
  const token = await twitchAppToken(id, secret);
  if (!token) return out;
  const qs = logins.map((l) => `user_login=${encodeURIComponent(l)}`).join("&");
  const res = await timedFetch(
    `https://api.twitch.tv/helix/streams?first=100&${qs}`,
    { headers: { "Client-Id": id, Authorization: `Bearer ${token}` } },
  );
  if (res.status === 401) twitchToken = null;
  if (!res.ok) return out;
  const data = (await res.json()) as {
    data?: { user_login: string; type: string; viewer_count: number }[];
  };
  const live = new Map(
    (data.data ?? [])
      .filter((s) => s.type === "live")
      .map((s) => [s.user_login.toLowerCase(), s.viewer_count]),
  );
  for (const login of logins)
    out.set(
      login,
      live.has(login)
        ? { live: true, viewers: live.get(login)! }
        : { live: false, viewers: null },
    );
  return out;
}

/** A YouTube video is live while it has a start and no end; the viewer count may be hidden by the channel. */
async function fetchYouTube(
  videoIds: string[],
): Promise<Map<string, StreamStatus>> {
  const out = new Map<string, StreamStatus>();
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || videoIds.length === 0) return out;
  const res = await timedFetch(
    `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoIds.map(encodeURIComponent).join(",")}&key=${encodeURIComponent(key)}`,
  );
  if (!res.ok) return out;
  const data = (await res.json()) as {
    items?: {
      id: string;
      liveStreamingDetails?: {
        actualStartTime?: string;
        actualEndTime?: string;
        concurrentViewers?: string;
      };
    }[];
  };
  const seen = new Set<string>();
  for (const item of data.items ?? []) {
    const d = item.liveStreamingDetails;
    seen.add(item.id);
    const live = !!d?.actualStartTime && !d.actualEndTime;
    const viewers =
      live && d?.concurrentViewers !== undefined
        ? Number(d.concurrentViewers)
        : null;
    out.set(item.id, {
      live,
      viewers: viewers !== null && Number.isFinite(viewers) ? viewers : null,
    });
  }
  return out;
}

/** The status of each target the platform answered for; a target missing from the result is unknown. */
export async function streamStatuses(
  targets: StatusTarget[],
): Promise<Map<string, StreamStatus>> {
  const result = new Map<string, StreamStatus>();
  const now = Date.now();
  const stale: StatusTarget[] = [];
  for (const t of new Map(targets.map((t) => [keyOf(t), t])).values()) {
    const hit = cache.get(keyOf(t));
    if (hit && now - hit.at < TTL_MS) result.set(keyOf(t), hit.status);
    else stale.push(t);
  }
  const ask = (platform: StatusTarget["platform"]) =>
    stale.filter((t) => t.platform === platform).map((t) => t.id);
  const [twitch, youtube] = await Promise.all([
    fetchTwitch(ask("TWITCH").slice(0, 100)).catch(
      () => new Map<string, StreamStatus>(),
    ),
    fetchYouTube(ask("YOUTUBE").slice(0, 50)).catch(
      () => new Map<string, StreamStatus>(),
    ),
  ]);
  for (const [id, status] of twitch)
    cache.set(`TWITCH:${id}`, { at: now, status });
  for (const [id, status] of youtube)
    cache.set(`YOUTUBE:${id}`, { at: now, status });
  for (const t of stale) {
    const status = cache.get(keyOf(t))?.status;
    if (status) result.set(keyOf(t), status);
  }
  if (cache.size > 2000)
    for (const [k, v] of cache) if (now - v.at > TTL_MS) cache.delete(k);
  return result;
}

export const statusKey = keyOf;
export const _resetStreamStatusCache = () => {
  cache.clear();
  twitchToken = null;
};
