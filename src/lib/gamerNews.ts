/**
 * Circuit — real-time gaming news for the homepage's `GamerNews` widget.
 * Circuit has no news/CMS backend of its own, so this pulls from public
 * RSS feeds published by real gaming outlets (no API key needed, unlike
 * Paystack/Flutterwave/Sentry/PostHog elsewhere in this codebase) and
 * merges them into one real, live-updating feed — not fabricated content.
 *
 * Each feed is fetched independently with `Promise.allSettled`: one dead
 * or slow feed degrades the result (fewer items) rather than taking the
 * whole widget — or the homepage render — down with it.
 *
 * Caching: each feed's parsed, trimmed items (a few KB) are kept in
 * memory for 15 minutes. Next's fetch cache can't do this — PC Gamer's
 * feed is ~6MB, over its 2MB per-entry limit, so it was re-downloaded on
 * every page view. After 15 minutes the old items are still served while
 * a single background refresh runs, so a page view never waits on an
 * outlet except the very first one after the server starts. A failed
 * refresh keeps the last good items.
 */

import { XMLParser } from "fast-xml-parser";

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: Date;
  image: string | null;
  snippet: string;
};

const FEEDS = [
  { source: "GameSpot", url: "https://www.gamespot.com/feeds/game-news/" },
  { source: "Eurogamer", url: "https://www.eurogamer.net/feed" },
  { source: "PC Gamer", url: "https://www.pcgamer.com/rss/" },
] as const;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

const FRESH_MS = 15 * 60_000;
const ITEMS_PER_FEED = 20;

type FeedCacheEntry = { items: NewsItem[]; fetchedAt: number; refreshing?: Promise<NewsItem[]> };
// On globalThis so dev-server reloads of this module keep the cache.
const feedCache: Map<string, FeedCacheEntry> = ((globalThis as { __gamerNewsCache?: Map<string, FeedCacheEntry> }).__gamerNewsCache ??= new Map());

/** A feed's items from the memory cache, refreshing in the background once stale. */
async function cachedFeed(source: string, url: string): Promise<NewsItem[]> {
  const entry = feedCache.get(url);
  const refresh = () => {
    const pending = fetchFeed(source, url)
      .then((items) => {
        feedCache.set(url, { items, fetchedAt: Date.now() });
        return items;
      })
      .catch((err) => {
        // Keep serving the last good copy; try again after another 15 minutes.
        const last = feedCache.get(url);
        if (last) feedCache.set(url, { items: last.items, fetchedAt: Date.now() });
        throw err;
      });
    feedCache.set(url, { items: entry?.items ?? [], fetchedAt: entry?.fetchedAt ?? 0, refreshing: pending });
    return pending;
  };

  if (!entry) return refresh(); // first view after start: nothing to serve yet
  if (entry.refreshing) return entry.fetchedAt ? entry.items : entry.refreshing;
  if (Date.now() - entry.fetchedAt > FRESH_MS) refresh().catch((err) => console.error("[gamerNews] feed refresh failed:", err));
  return entry.items;
}

async function fetchFeed(source: string, url: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "CircuitApp/1.0 (+https://circuit.app)" },
    cache: "no-store", // cached above, trimmed — see the header comment
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${source} feed returned ${res.status}`);

  const xml = await res.text();
  const parsed = parser.parse(xml);
  const items = toArray(parsed?.rss?.channel?.item);

  return items
    .map((item): NewsItem | null => {
      const title = typeof item.title === "string" ? item.title : item.title?.["#text"];
      const link = typeof item.link === "string" ? item.link : item.link?.["#text"];
      if (!title || !link) return null;

      const description = typeof item.description === "string" ? item.description : "";
      const mediaContent = toArray(item["media:content"]);
      const image = mediaContent.find((m) => m?.["@_url"])?.["@_url"] ?? null;
      const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

      return {
        title: stripHtml(title),
        link,
        source,
        publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
        image,
        snippet: stripHtml(description).slice(0, 140),
      };
    })
    .filter((item): item is NewsItem => item !== null)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, ITEMS_PER_FEED);
}

/** Merged, newest-first gaming news across every source. Never throws —
 *  a source that fails to fetch or parse just contributes zero items. */
export async function fetchGamerNews(limit = 5): Promise<NewsItem[]> {
  const results = await Promise.allSettled(FEEDS.map((feed) => cachedFeed(feed.source, feed.url)));

  const items = results.flatMap((result) => {
    if (result.status === "fulfilled") return result.value;
    console.error("[gamerNews] feed fetch failed:", result.reason);
    return [];
  });

  return items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, limit);
}
