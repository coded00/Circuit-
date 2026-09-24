/**
 * Circuit — homepage "Communities" card: every community the viewer has
 * joined (Circuit's own platform-wide one, which every account is a
 * member of automatically, plus any tournament communities they've
 * joined), each with a per-community unread badge. Sits above the
 * Leaderboard card in the right rail (see page.tsx).
 *
 * Shown even when it'd only have the one Circuit entry — Circuit
 * Community is a brand-new Phase 1 feature; hiding the card until
 * someone's joined a tournament community too would work against the
 * one thing this phase exists to measure: whether people discover and
 * use it at all.
 */

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { JoinedCommunity } from "@/lib/community";
import { Panel, PanelEmpty, PanelRows, panelRowClass } from "@/components/ui/Panel";

export function CommunitiesCard({ communities }: { communities: JoinedCommunity[] }) {
  return (
    <Panel
      title="Communities"
      action={
        <Link href="/communities/browse" className="text-xs font-medium text-accent-blue hover:underline">
          Browse
        </Link>
      }
    >
      {communities.length === 0 ? (
        <PanelEmpty>You haven&apos;t joined any communities yet.</PanelEmpty>
      ) : (
        <PanelRows>
          {communities.map((c) => (
            <Link key={c.id} href={c.href} className={`${panelRowClass} py-2.5`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-blue-soft text-accent-blue">
                <MessageCircle size={14} />
              </span>
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
