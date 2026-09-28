/**
 * Circuit — Admin Content. Three real sections:
 *
 * - Homepage Carousel: real `HomepageBanner` rows, rendered by
 *   `CircuitHero` on the actual player homepage (see that component's
 *   own comment) — this is the literal "update the homepage without
 *   touching code" mechanism.
 * - Gamer News: NOT admin-editable, on purpose — it's real, live RSS
 *   content from real gaming outlets (src/lib/gamerNews.ts), not
 *   something Circuit authors. Shown here read-only so that's obvious
 *   rather than silently missing a section the product spec asked for.
 * - Announcements: real `Announcement` rows — the most recent enabled
 *   one shows in a dismissible strip at the top of the player homepage.
 */

import { fetchGamerNews } from "@/lib/gamerNews";
import { prisma } from "@/lib/db";
import { BannerList } from "@/components/admin/BannerList";
import { AnnouncementList } from "@/components/admin/AnnouncementList";
import { VideoQueue } from "@/components/admin/VideoQueue";
import { EmptyState, PageHeader, Panel, Section, SubNav } from "@/components/admin/ui";

export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "videos" || tabParam === "news" ? tabParam : "homepage";
  const [banners, announcements, newsItems, videos, videoCounts] = await Promise.all([
    prisma.homepageBanner.findMany({ orderBy: { order: "asc" } }),
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" } }),
    tab === "news" ? fetchGamerNews().catch(() => []) : Promise.resolve([] as Awaited<ReturnType<typeof fetchGamerNews>>),
    prisma.video.findMany({
      where: { status: { in: ["DRAFT", "PUBLISHED"] } },
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }],
      take: 500,
      select: { id: true, title: true, thumbnailUrl: true, sourceAuthor: true, sourceUrl: true, game: true, status: true },
    }),
    prisma.video.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countOf = (s: "DRAFT" | "PUBLISHED") => videoCounts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <>
      <PageHeader title="Content" description="What players see on the homepage and in the feed." />
      <SubNav
        active={tab}
        items={[
          { key: "homepage", label: "Homepage", href: "/admin/content" },
          { key: "videos", label: "Feed videos", href: "/admin/content?tab=videos", count: countOf("DRAFT") || undefined },
          { key: "news", label: "Gamer news", href: "/admin/content?tab=news" },
        ]}
      />

      {tab === "homepage" && (
        <>
          <Section
            title="Homepage carousel"
            description="Slides on the player homepage hero. Reorder with the arrows, disable without deleting, or schedule a publish date. With none live, the homepage shows Circuit's default pitch."
          >
            <Panel>
              <BannerList banners={banners.map((b) => ({ ...b, publishAt: b.publishAt?.toISOString() ?? null }))} />
            </Panel>
          </Section>
          <Section title="Announcements" description="The most recent enabled announcement shows in a strip at the top of the homepage.">
            <Panel>
              <AnnouncementList announcements={announcements.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))} />
            </Panel>
          </Section>
        </>
      )}

      {tab === "videos" && (
        <Section description="Clips in the player feed. Imports pull the latest shorts from the approved YouTube channels as drafts — nothing appears in the feed until it's published here.">
          <VideoQueue videos={videos} counts={{ DRAFT: countOf("DRAFT"), PUBLISHED: countOf("PUBLISHED") }} youtubeConfigured={!!process.env.YOUTUBE_API_KEY} />
        </Section>
      )}

      {tab === "news" && (
        <Section
          description={`Live RSS from gaming outlets${newsItems.length > 0 ? ` (${[...new Set(newsItems.map((n) => n.source))].join(", ")})` : ""}. Not editable — shown here for reference.`}
        >
          {newsItems.length === 0 ? (
            <EmptyState title="News feed unavailable right now" description="The outlets' RSS feeds didn't respond. It retries on the next load." />
          ) : (
            <Panel padded={false}>
              {newsItems.slice(0, 15).map((item) => (
                <a
                  key={item.link}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-surface-elevated sm:px-5"
                >
                  <span className="w-[110px] shrink-0 truncate text-[12px] text-muted-strong">{item.source}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
                  <span className="shrink-0 text-[12px] text-muted">{item.publishedAt.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
                </a>
              ))}
            </Panel>
          )}
        </Section>
      )}
    </>
  );
}
