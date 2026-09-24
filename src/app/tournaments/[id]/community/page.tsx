/**
 * Circuit Community — Phase 1's dedicated full-width page (same reason
 * the bracket has its own page instead of living inside the tournament
 * tab shell: a real Discord-style layout needs more room than the
 * `1fr` tab column next to the sticky registration sidebar gives it,
 * especially on mobile).
 */

import type { Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getChannelMessages, DEFAULT_CHANNELS } from "@/lib/community";
import { CommunityView } from "./CommunityView";

/** Android Chrome: let the on-screen keyboard shrink the layout viewport,
 *  so CommunityView's fixed chat panel (and its composer) moves up above
 *  the keyboard instead of being covered by it. Chat pages only. */
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

export default async function CommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/tournaments/${id}/community`)}`);
  }

  const [tournament, community] = await Promise.all([
    prisma.tournament.findUnique({ where: { id }, select: { id: true, name: true } }),
    prisma.community.findUnique({
      where: { tournamentId: id },
      include: { channels: true, _count: { select: { members: true } } },
    }),
  ]);
  if (!tournament || !community || !community.enabled) notFound();

  // Fixed V1 order (general/announcements/matches/results) regardless of
  // DB row order — `channels` was `createMany`'d together, but nothing
  // guarantees Postgres hands them back in insertion order without an
  // explicit orderBy, and there's no `order` column to sort by yet.
  const channelOrder = new Map(DEFAULT_CHANNELS.map((c, i) => [c.key, i]));
  const channels = [...community.channels].sort(
    (a, b) => (channelOrder.get(a.key) ?? 99) - (channelOrder.get(b.key) ?? 99)
  );

  // Membership has to be known BEFORE fetching messages, not fetched in
  // parallel with them — getChannelMessages now asserts membership itself
  // (see its own comment), and a non-member viewing this page (the
  // community/tournament being public doesn't imply the channel's
  // messages are) should see the join prompt, not a thrown error.
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: community.id, userId: user.id } },
  });
  const initialMessages =
    channels[0] && membership
      ? await getChannelMessages(channels[0].id, user.id)
      : { messages: [], nextCursor: null };

  return (
    <CommunityView
      communityId={community.id}
      backHref={`/tournaments/${tournament.id}`}
      title={tournament.name}
      channels={channels.map((c) => ({ id: c.id, key: c.key, name: c.name }))}
      memberCount={community._count.members}
      // Serialized to ISO strings — a Date crossing the server/client
      // boundary as a plain prop is one more thing to keep straight than
      // a string, matching how CountdownTimer's own caller does it.
      initialChannelMessages={initialMessages.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      isMember={membership !== null}
    />
  );
}
