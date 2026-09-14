import { Newspaper } from "lucide-react";
import { fetchGamerNews } from "@/lib/gamerNews";

/**
 * Circuit — homepage sidebar "Gamer News" widget. Real, live articles from
 * public gaming-outlet RSS feeds (see `src/lib/gamerNews.ts` for sources
 * and caching) — not fabricated content. Renders nothing if every feed is
 * unreachable, same as every other homepage section that hides itself
 * when it has no real data to show.
 */

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function formatRelative(date: Date): string {
  const diffMin = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour");
  return relativeTime.format(Math.round(diffHour / 24), "day");
}

export async function GamerNews() {
  const items = await fetchGamerNews(5);
  if (items.length === 0) return null;

  return (
    <div className="card flex flex-col gap-3">
      <h2 className="text-card-title flex items-center gap-2">
        <Newspaper size={15} className="text-accent-blue" />
        Gamer News
      </h2>
      <div className="border-b border-border" />
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <a
            key={item.link}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="flex items-start gap-3 rounded-lg p-1.5 transition hover:bg-surface-elevated"
          >
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host article images
              <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded-[8px] object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated text-muted">
                <Newspaper size={18} />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[11px] font-medium text-muted">
                <span className="text-accent-blue">{item.source}</span> · {formatRelative(item.publishedAt)}
              </span>
              <span className="text-card-title line-clamp-2 leading-snug font-semibold">{item.title}</span>
              {item.snippet && <span className="text-metadata line-clamp-1">{item.snippet}</span>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
