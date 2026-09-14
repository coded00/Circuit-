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

export default async function AdminContentPage() {
  const [banners, announcements, newsItems] = await Promise.all([
    prisma.homepageBanner.findMany({ orderBy: { order: "asc" } }),
    prisma.announcement.findMany({ orderBy: { createdAt: "desc" } }),
    fetchGamerNews().catch(() => []),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Content</h1>
        <p className="text-sm text-muted">What shows up on the player-facing platform.</p>
      </div>

      <div className="card flex flex-col gap-1">
        <h2 className="text-card-title">Homepage Carousel</h2>
        <p className="text-xs text-muted">
          Real slides on the player homepage hero — reorder with the arrows, disable without deleting, or schedule a future
          publish date. No banners published falls back to Circuit&apos;s default pitch.
        </p>
        <BannerList
          banners={banners.map((b) => ({
            ...b,
            publishAt: b.publishAt?.toISOString() ?? null,
          }))}
        />
      </div>

      <div className="card flex flex-col gap-1">
        <h2 className="text-card-title">Gamer News</h2>
        <p className="text-xs text-muted">
          Live RSS from real gaming outlets
          {newsItems.length > 0 && ` (${[...new Set(newsItems.map((n) => n.source))].join(", ")})`} — not admin-editable, shown
          here for reference only.
        </p>
        {newsItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Feed unavailable right now.</p>
        ) : (
          <div className="flex flex-col">
            {newsItems.slice(0, 5).map((item, i) => (
              <a
                key={item.link}
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent-volt ${i > 0 ? "border-t border-border" : ""}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted-strong">{item.source}</span> · {item.title}
                </span>
                <span className="shrink-0 text-xs text-muted-strong">{item.publishedAt.toLocaleDateString("en-NG")}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="card flex flex-col gap-1">
        <h2 className="text-card-title">Announcements</h2>
        <p className="text-xs text-muted">The most recently-published enabled announcement shows in a strip at the top of the homepage.</p>
        <AnnouncementList
          announcements={announcements.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
