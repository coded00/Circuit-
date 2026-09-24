/**
 * Circuit Community — every enabled community on the platform, not just
 * the ones the viewer has already joined. Reached from the homepage
 * Communities card's "View All" link (`CommunitiesCard.tsx`), which
 * only lists joined communities.
 *
 * Joining happens on a community's own page, not here — `CommunityView`
 * already renders a join prompt for a non-member, so a row here just
 * links straight into it instead of duplicating that flow.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getAllCommunities } from "@/lib/community";

export default async function BrowseCommunitiesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/communities/browse")}`);
  }

  const communities = await getAllCommunities(user.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted hover:text-foreground">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-section-heading">Communities</h1>
      </div>

      <div className="card flex flex-col gap-1 p-2">
        {communities.map((c) => (
          <Link key={c.id} href={c.href} className="card-row flex items-center gap-3 p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-blue-soft text-accent-blue">
              <MessageCircle size={15} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{c.title}</span>
              <span className="text-metadata truncate">
                {c.subtitle} · {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
              </span>
            </div>
            {c.isMember ? (
              c.unreadCount > 0 ? (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-live px-1.5 text-xs font-semibold text-white">
                  {c.unreadCount > 99 ? "99+" : c.unreadCount}
                </span>
              ) : (
                <span className="text-metadata shrink-0">Joined</span>
              )
            ) : (
              <span className="text-xs font-medium text-accent-blue shrink-0">Join</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
