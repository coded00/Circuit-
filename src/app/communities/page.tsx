/**
 * Circuit Community — the platform-wide "Circuit" community every
 * account is a member of (see `joinGlobalCommunity`). Same
 * `CommunityView` shell as a tournament's own community page
 * (`src/app/tournaments/[id]/community/page.tsx`), just backed by
 * `getOrCreateGlobalCommunity` instead of one tournament's row.
 *
 * `/communities` (plural), not `/community` — that singular path is
 * already the unrelated `CommunityPost` global feed page (see that
 * model's own schema comment); this is a distinct feature under a
 * distinct URL, not a replacement for it.
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getChannelMessages, getOrCreateGlobalCommunity, DEFAULT_CHANNELS, joinGlobalCommunity } from "@/lib/community";
import { prisma } from "@/lib/db";
import { CommunityView } from "../tournaments/[id]/community/CommunityView";

export default async function GlobalCommunityPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent("/communities")}`);
  }

  const community = await getOrCreateGlobalCommunity();

  // Every account is auto-joined at signup, but accounts that existed
  // before this feature shipped only get it via the one-off backfill
  // script — this call makes visiting the page itself self-healing for
  // any account the backfill ever misses, same idempotent upsert either
  // way.
  await joinGlobalCommunity(user.id);

  const [channels, memberCount] = await Promise.all([
    prisma.channel.findMany({ where: { communityId: community.id } }),
    prisma.communityMember.count({ where: { communityId: community.id } }),
  ]);
  const channelOrder = new Map(DEFAULT_CHANNELS.map((c, i) => [c.key, i]));
  const orderedChannels = [...channels].sort(
    (a, b) => (channelOrder.get(a.key) ?? 99) - (channelOrder.get(b.key) ?? 99)
  );

  const initialMessages = orderedChannels[0]
    ? await getChannelMessages(orderedChannels[0].id)
    : { messages: [], nextCursor: null };

  return (
    <CommunityView
      communityId={community.id}
      backHref="/"
      title="Circuit"
      channels={orderedChannels.map((c) => ({ id: c.id, key: c.key, name: c.name }))}
      memberCount={memberCount}
      initialChannelMessages={initialMessages.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      isMember
    />
  );
}
