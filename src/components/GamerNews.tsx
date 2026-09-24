import { Newspaper } from "lucide-react";
import { fetchGamerNews } from "@/lib/gamerNews";
import { Panel, PanelRows, panelRowClass } from "@/components/ui/Panel";

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
    <Panel title="Gamer news">
      <PanelRows>
        {items.map((item) => (
          <a key={item.link} href={item.link} target="_blank" rel="noreferrer" className={`${panelRowClass} items-start py-3`}>
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host article images
              <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded-[8px] object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[8px] bg-surface-elevated text-muted">
                <Newspaper size={18} />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[11px] text-muted">
                <span className="font-medium text-foreground/80">{item.source}</span> · {formatRelative(item.publishedAt)}
              </span>
              <span className="line-clamp-2 text-sm leading-snug font-medium">{item.title}</span>
            </div>
          </a>
        ))}
      </PanelRows>
    </Panel>
  );
}
