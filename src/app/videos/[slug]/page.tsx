/**
 * Circuit Video Feed — deep-link page (spec section 14: "every important
 * video should have a shareable URL... opens the correct video, not just
 * the homepage"). Renders the exact same `FeedClient` the `/ladder` feed
 * uses, seeded so the shared video plays first, with the normal for-you
 * feed continuing right after it — sharing a clip doesn't strand the
 * viewer on a dead end once it finishes.
 *
 * Indexable (section 17): unique title/description, canonical URL, Open
 * Graph image, and VideoObject structured data. 404s for a slug that
 * doesn't resolve to a real, published video rather than rendering an
 * empty feed.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { getVideoBySlug, getFeedPage, FEED_PAGE_SIZE } from "@/lib/videos";
import { buildMetadata, absoluteUrl, videoPath, DEFAULT_OG_IMAGE } from "@/lib/seo";
import { FeedClient, FEED_VIEWPORT_CLASS } from "@/components/video-feed/FeedClient";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const video = await getVideoBySlug(slug, null);
  if (!video) return buildMetadata({ title: "Video not found", description: "", path: `/videos/${slug}`, noindex: true });

  return buildMetadata({
    title: video.title,
    description: video.description ?? `Watch ${video.title} on Circuit.`,
    path: videoPath(video),
    image: video.thumbnailUrl ?? undefined,
  });
}

export default async function VideoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const video = await getVideoBySlug(slug, user?.id ?? null);
  if (!video) notFound();

  const { videos: rest, nextCursor, seed } = await getFeedPage({
    tab: "for-you",
    take: FEED_PAGE_SIZE,
    userId: user?.id ?? null,
  });

  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description ?? video.title,
    thumbnailUrl: video.thumbnailUrl ?? DEFAULT_OG_IMAGE,
    uploadDate: (video.publishedAt ?? video.createdAt).toISOString(),
    contentUrl: video.videoUrl ?? undefined,
    embedUrl: absoluteUrl(videoPath(video)),
  };

  return (
    <div className={FEED_VIEWPORT_CLASS}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }} />
      <FeedClient
        initialVideos={[video, ...rest.filter((v) => v.id !== video.id)]}
        initialNextCursor={nextCursor}
        initialSeed={seed}
        games={[]}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}
