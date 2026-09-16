/**
 * Circuit — shared SEO helpers: metadata builder, slug/path generation for
 * tournament and battle URLs, and absolute-URL resolution. One source of
 * truth so every page's generateMetadata and every internal link builder
 * agree on the same URL shape instead of drifting independently.
 */

import type { Metadata } from "next";

export const SITE_NAME = "Circuit";
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const DEFAULT_DESCRIPTION =
  "Join gaming tournaments and esports competitions on Circuit — Nigeria-first tournaments, 1v1 Challenges, real prizes, and a real gaming community.";
/** Falls back to the wordmark only when a page has no real artwork of its
 *  own (a poster, game art) to share instead — see each caller's own
 *  `image` argument. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/circuit-logo.png`;

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Kebab-case, ASCII-safe, no leading/trailing dashes — good enough for a
 *  cosmetic URL slug. Not a unique key: the real lookup is always the ID
 *  segment before the first hyphen (see parseIdSegment), so collisions
 *  between two same-named tournaments are harmless. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Prisma's default cuid() ids never contain a hyphen, so the real id is
 *  always everything before the first one. A bare-id link with no slug
 *  suffix at all — every tournament/battle URL already shared or indexed
 *  before this change existed — parses identically. Zero redirect needed. */
export function parseIdSegment(param: string): string {
  return param.split("-")[0];
}

export function tournamentPath(tournament: { id: string; name: string }): string {
  const slug = slugify(tournament.name);
  return slug ? `/tournaments/${tournament.id}-${slug}` : `/tournaments/${tournament.id}`;
}

export function battlePath(battle: { id: string; game: string }): string {
  const slug = slugify(`${battle.game} challenge`);
  return slug ? `/battles/${battle.id}-${slug}` : `/battles/${battle.id}`;
}

export function gamePath(gameName: string): string {
  return `/games/${slugify(gameName)}`;
}

export function organiserPath(handle: string): string {
  return `/organisers/${handle}`;
}

/** Shared metadata builder — every page passes its own title/description/
 *  path/image; this owns the OpenGraph/Twitter/canonical shape so no page
 *  hand-rolls that structure independently. */
export function buildMetadata({
  title,
  description,
  path,
  image,
  imageAlt,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  noindex?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  const ogImage = image ?? DEFAULT_OG_IMAGE;
  return {
    // The browser-tab/search-result title gets the site suffix directly
    // (not via Next's title.template — see layout.tsx's own comment on
    // why that turned out unreliable here). og:title stays unsuffixed:
    // og:site_name already carries "Circuit" for social unfurls, so
    // appending it into the title too would just be redundant clutter.
    title: `${title} | ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: ogImage, alt: imageAlt ?? title }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}
