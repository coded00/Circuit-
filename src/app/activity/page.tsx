/**
 * Circuit — Feed → Activity. What's been happening: results, new and
 * finished tournaments, announcements, new communities. Real events only
 * (src/lib/activityFeed.ts). The short-video feed is its sibling tab at
 * /ladder, which is full-screen and so stays its own page.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Swords, Trophy, Users, Flag } from "lucide-react";
import { getActivity, type ActivityItem, type ActivityKind } from "@/lib/activityFeed";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Activity",
  description: "Match results, new and finished tournaments and announcements from across Circuit.",
  path: "/activity",
});

const ICON: Record<ActivityKind, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  announcement: Megaphone,
  tournament: Trophy,
  finished: Flag,
  result: Swords,
  community: Users,
};

const rel = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function relative(date: Date): string {
  const min = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(min) < 60) return rel.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rel.format(hr, "hour");
  return rel.format(Math.round(hr / 24), "day");
}

function Row({ item }: { item: ActivityItem }) {
  const Icon = ICON[item.kind];
  const body = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          item.kind === "announcement" ? "bg-accent-volt text-accent-volt-foreground" : "bg-surface-elevated text-foreground"
        }`}
      >
        <Icon size={17} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] leading-snug font-semibold">{item.title}</span>
        {item.detail && <span className="line-clamp-2 text-sm text-muted">{item.detail}</span>}
      </span>
      <time dateTime={item.at.toISOString()} className="shrink-0 pt-0.5 text-xs text-muted" suppressHydrationWarning>
        {relative(item.at)}
      </time>
    </>
  );
  const cls = "flex items-start gap-3.5 px-5 py-4";
  return item.href ? (
    <Link href={item.href} className={`${cls} transition hover:bg-surface-elevated/60`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default async function ActivityPage() {
  const items = await getActivity();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-3xl leading-none font-bold tracking-tight uppercase sm:text-4xl">Feed</h1>
        <div role="tablist" aria-label="Feed" className="tabs">
          <Link role="tab" aria-selected href="/activity" className="tab tab-active py-3">
            Activity
          </Link>
          <Link role="tab" aria-selected={false} href="/ladder" className="tab py-3">
            Videos
          </Link>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="card state-block">
          <h2 className="state-title">Nothing yet</h2>
          <p className="state-description">Results, new tournaments and announcements from the last 30 days will show up here.</p>
          <Link href="/compete" className="btn-primary">
            Find a tournament
          </Link>
        </div>
      ) : (
        <ul data-stagger className="card divide-y divide-border overflow-hidden p-0">
          {items.map((item) => (
            <li key={item.id}>
              <Row item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
