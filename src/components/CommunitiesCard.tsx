/**
 * Circuit — homepage "Communities" card: every community the viewer has
 * joined (Circuit's own, game hubs, player and tournament communities),
 * each with a per-community unread badge. Sits above the
 * Leaderboard card in the right rail (see page.tsx).
 *
 * Shown even when it'd only have the one Circuit entry — Circuit
 * Community is a brand-new Phase 1 feature; hiding the card until
 * someone's joined a tournament community too would work against the
 * one thing this phase exists to measure: whether people discover and
 * use it at all.
 */

import Link from "next/link";
import type { JoinedCommunity } from "@/lib/community";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { Panel, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";

export function CommunitiesCard({ communities }: { communities: JoinedCommunity[] }) {
  return (
    <Panel
      title="Communities"
      action={
        <Link href="/communities" className="text-xs font-medium text-accent-blue hover:underline">
          Discover
        </Link>
      }
    >
      {communities.length === 0 ? (
        <PanelEmpty>You haven&apos;t joined any communities yet.</PanelEmpty>
      ) : (
        <PanelRows>
          {communities.map((c) => (
            <Link key={c.id} href={c.href} className={`${panelRowClass} py-2.5`}>
              <CommunityAvatar name={c.title} iconUrl={c.iconUrl} tag={c.tag} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{c.title}</span>
                <span className="text-metadata truncate">{c.subtitle}</span>
              </div>
              {c.unreadCount > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-live px-1.5 text-[11px] font-semibold text-white">
                  {c.unreadCount > 99 ? "99+" : c.unreadCount}
                </span>
              )}
            </Link>
          ))}
        </PanelRows>
      )}
    </Panel>
  );
}
