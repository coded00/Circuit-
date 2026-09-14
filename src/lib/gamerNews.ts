/**
 * Circuit — real-time gaming news for the homepage's `GamerNews` widget.
 * Circuit has no news/CMS backend of its own, so this pulls from public
 * RSS feeds published by real gaming outlets (no API key needed, unlike
 * Paystack/Flutterwave/Sentry/PostHog elsewhere in this codebase) and
 * merges them into one real, live-updating feed — not fabricated content.
 *
 * Each feed is fetched independently with `Promise.allSettled`: one dead
 * or slow feed degrades the result (fewer items) rather than taking the
 * whole widget — or the homepage render — down with it. Next's fetch
 * cache (`next.revalidate`) keeps this from re-hitting every outlet on
 * every request; 15 minutes is fresh enough for "gaming news" without
 * hammering someone else's server on every homepage view.
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

async function fetchFeed(source: string, url: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "CircuitApp/1.0 (+https://circuit.app)" },
    next: { revalidate: 900 },
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
    .filter((item): item is NewsItem => item !== null);
}

/** Merged, newest-first gaming news across every source. Never throws —
 *  a source that fails to fetch or parse just contributes zero items. */
export async function fetchGamerNews(limit = 5): Promise<NewsItem[]> {
  const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed.source, feed.url)));

  const items = results.flatMap((result) => {
    if (result.status === "fulfilled") return result.value;
    console.error("[gamerNews] feed fetch failed:", result.reason);
    return [];
  });

  return items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).slice(0, limit);
}
