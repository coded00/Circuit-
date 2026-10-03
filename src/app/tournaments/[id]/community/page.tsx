/**
 * Circuit Community — a tournament's own community, on a full-width page
 * (a Discord-style layout needs more room than the tournament tab column).
 * The organizer owns it; players join from here.
 */

import type { Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { loadCommunityPage } from "@/lib/communityPage";
import { CommunityView } from "./CommunityView";

/** Android Chrome: let the on-screen keyboard shrink the layout viewport,
 *  so CommunityView's fixed chat panel (and its composer) moves up above
 *  the keyboard instead of being covered by it. Chat pages only. */
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `channel` (key) + `message` (id): a mention notification's deep link. */
  searchParams: Promise<{ channel?: string; message?: string; thread?: string }>;
}) {
  const { id } = await params;
  const { channel: channelKey, message: highlightMessageId, thread: threadParam } = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath(`/tournaments/${id}/community`));
  }

  const [tournament, community] = await Promise.all([
    prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true } }),
    prisma.community.findUnique({ where: { tournamentId: id }, include: { tournament: { select: { organizerId: true } } } }),
  ]);
  if (!tournament || !community || !community.enabled) notFound();

  // Membership is known before messages are fetched: a non-member sees
  // the join prompt, not a thrown membership error.
  const data = await loadCommunityPage(community, user, { channelKey });

  return (
    <CommunityView
      communityId={community.id}
      backHref={`/tournaments/${tournament.id}`}
      title={tournament.name}
      channels={data.channels.map((c) => ({ id: c.id, key: c.key, name: c.name, modOnly: c.modOnly }))}
      memberCount={data.memberCount}
      // Serialized to ISO strings for the client boundary.
      initialChannelMessages={data.initialMessages}
      initialThreadId={threadParam}
      initialChannelId={data.startChannel?.id}
      initialServerTime={data.initialServerTime}
      highlightMessageId={highlightMessageId}
      viewerId={user.id}
      isMember={data.isMember}
      viewerRole={data.role}
      roleBadges={data.roleBadges}
      mutedUntil={data.mutedUntil}
      menu={{
        communityId: community.id,
        communityName: tournament.name,
        canInvite: false,
        canLeave: data.role !== "OWNER",
      }}
    />
  );
}
