/**
 * Circuit — homepage "Communities" card: every community the viewer has
 * joined (Circuit's own, game hubs, player and tournament communities),
 * each with a per-community unread badge. Sits in the right rail (see
 * page.tsx). Always shown, even with only Circuit's own entry, with a last
 * row that leads on to Discover so there is always somewhere to go next.
 */

import Link from "next/link";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import type { JoinedCommunity } from "@/lib/community";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { Panel, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";

export function CommunitiesCard({ communities }: { communities: JoinedCommunity[] }) {
  const unreadTotal = communities.reduce((n, c) => n + c.unreadCount, 0);
  return (
    <Panel
      title="Communities"
      meta={communities.length || undefined}
      action={
        <Link href="/communities" className="flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline">
          Discover <ArrowRight size={12} aria-hidden />
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
                <span className={`truncate text-sm ${c.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>{c.title}</span>
                <span className="text-metadata truncate">{c.unreadCount > 0 ? `${c.unreadCount} new ${c.unreadCount === 1 ? "message" : "messages"}` : c.subtitle}</span>
              </div>
              {c.unreadCount > 0 ? (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center cut-xs bg-live px-1.5 text-[11px] font-semibold text-white">
                  {c.unreadCount > 99 ? "99+" : c.unreadCount}
                </span>
              ) : (
                <ChevronRight size={16} className="shrink-0 text-muted/40 transition group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
              )}
            </Link>
          ))}
          <Link href="/communities" className={`${panelRowClass} py-3 text-muted hover:text-foreground`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center cut-avatar border border-dashed border-border-strong">
              <Plus size={14} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">Find more communities</span>
              <span className="text-metadata truncate">{unreadTotal > 0 ? "Game hubs, campus crews and city squads" : "Join your game's hub or your city's squad"}</span>
            </span>
          </Link>
        </PanelRows>
      )}
    </Panel>
  );
}
