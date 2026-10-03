/**
 * Circuit — one community (the Circuit community, a game hub, or a
 * player community). Members get the chat; everyone else — including
 * guests arriving from a shared link — gets its profile with the right
 * way in (join, apply, or "invite only"). Members can open the profile
 * too, via ?view=about.
 */

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { communityHref, getOrCreateGlobalCommunity, GLOBAL_SLUG, joinGlobalCommunity } from "@/lib/community";
import { getActivityStats } from "@/lib/communityDirectory";
import { loadCommunityPage } from "@/lib/communityPage";
import { loginPath, signupPath } from "@/lib/safeRedirect";
import { SITE_URL } from "@/lib/seo";
import { CommunityProfile } from "@/components/community/CommunityProfile";
import { JoinCommunityPanel } from "@/components/community/JoinCommunityPanel";
import { AppealForm } from "@/components/community/AppealForm";
import { CommunityTeams } from "@/components/community/CommunityTeams";
import { CreateEventButton } from "@/components/community/EventControls";
import { listCommunityTeams } from "@/lib/communityModeration";
import { CommunityView } from "../../tournaments/[id]/community/CommunityView";

/** Android Chrome: let the on-screen keyboard shrink the layout viewport
 *  so the chat composer moves up above it (see CommunityView). */
export const viewport: Viewport = { interactiveWidget: "resizes-content" };

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ channel?: string; message?: string; view?: string; thread?: string }> };

async function findCommunity(slug: string) {
  // The Circuit community is created on first use (see getOrCreateGlobalCommunity).
  if (slug.toLowerCase() === GLOBAL_SLUG) await getOrCreateGlobalCommunity();
  return prisma.community.findUnique({
    where: { slug: slug.toLowerCase() },
    include: { tournament: { select: { organizerId: true } }, game: { select: { name: true } } },
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const community = await findCommunity((await params).slug);
  if (!community?.enabled) return { title: "Community not found" };
  const name = community.name ?? "Community";
  const description = community.description ?? `Join ${name} on Circuit.`;
  return {
    title: name,
    description,
    openGraph: { title: `${name} · Circuit`, description },
    // Invite-only communities aren't meant to be found by search engines.
    robots: community.joinPolicy === "INVITE" && community.kind === "PLAYER" ? { index: false, follow: false } : undefined,
  };
}

export default async function CommunityPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { channel: channelKey, message: highlightMessageId, view, thread: threadParam } = await searchParams;
  const [community, user] = await Promise.all([findCommunity(slug), getCurrentUser()]);
  if (!community) notFound();
  if (!community.enabled && !user?.isStaff) {
    // Only the owner learns why it was suspended (and can appeal); to
    // everyone else it simply isn't there.
    if (community.suspendedAt && user && community.ownerId === user.id) {
      const pending = await prisma.appeal.count({ where: { communityId: community.id, userId: user.id, status: "OPEN" } });
      return (
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 py-12">
          <div className="flex flex-col gap-2">
            <span className="badge badge-cancelled w-fit">Suspended</span>
            <h1 className="font-display text-2xl font-bold tracking-tight">{community.name} is suspended</h1>
            <p className="text-sm text-muted">Circuit staff suspended it: {community.suspensionReason ?? "it broke the community rules."} Members can&apos;t see it while it&apos;s suspended.</p>
          </div>
          <AppealForm kind="COMMUNITY_SUSPENSION" communityId={community.id} pending={pending > 0} />
        </div>
      );
    }
    notFound();
  }
  if (community.kind === "TOURNAMENT") redirect(communityHref(community));
  if (community.slug !== slug) redirect(`/communities/${community.slug}`);

  // Every account belongs to Circuit; visiting self-heals any gap.
  if (user && community.kind === "GLOBAL") await joinGlobalCommunity(user.id);

  const data = await loadCommunityPage(community, user, { channelKey });
  const name = community.name ?? "Community";
  const here = `/communities/${community.slug}`;

  if (!data.isMember || view === "about") {
    const [stats, application, banned, teams, captained] = await Promise.all([
      getActivityStats([community.id]),
      user ? prisma.communityApplication.findUnique({ where: { communityId_userId: { communityId: community.id, userId: user.id } } }) : null,
      user ? prisma.communityBan.count({ where: { communityId: community.id, userId: user.id } }) : 0,
      listCommunityTeams(community.id),
      user && data.isMember ? prisma.team.findMany({ where: { captainId: user.id }, select: { id: true, name: true } }) : [],
    ]);
    const teamsAllowed = community.kind !== "GLOBAL";
    const action = data.isMember ? (
      <Link href={here} className="btn-primary h-12 w-full gap-2 text-[15px] sm:w-auto sm:px-8">
        <MessageCircle size={17} /> Open chat
      </Link>
    ) : !user ? (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={signupPath(here)} className="btn-primary h-12 text-[15px] sm:px-8">
          Sign up to join
        </Link>
        <Link href={loginPath(here)} className="btn-secondary h-12 text-[15px] sm:px-6">
          I have an account
        </Link>
      </div>
    ) : (
      <JoinCommunityPanel
        communityId={community.id}
        name={name}
        joinPolicy={community.kind === "PLAYER" ? community.joinPolicy : "OPEN"}
        rules={community.rules}
        applicationQuestion={community.applicationQuestion}
        pending={application?.status === "PENDING"}
        banned={banned > 0}
      />
    );

    return (
      <CommunityProfile
        community={{ ...community, name, gameName: community.game?.name ?? null }}
        shareUrl={`${SITE_URL}${here}`}
        memberCount={data.memberCount}
        activeThisWeek={stats.get(community.id)?.posters ?? 0}
        channels={data.channels}
        events={data.events}
        communityEvents={data.communityEvents.map((e) => ({ ...e, href: `${here}/events/${e.id}` }))}
        eventsAction={data.canModerate && data.isMember ? <CreateEventButton communityId={community.id} communityHref={here} /> : undefined}
        moderators={data.moderators}
        action={action}
        teamsSection={
          teamsAllowed ? (
            <CommunityTeams
              communityId={community.id}
              teams={teams}
              viewerId={user?.id ?? null}
              canModerate={data.canModerate}
              addable={captained.filter((t) => !teams.some((x) => x.id === t.id))}
            />
          ) : undefined
        }
        backHref={data.isMember ? here : "/communities"}
      />
    );
  }

  const canInvite = community.kind !== "GLOBAL" && (community.joinPolicy !== "INVITE" || data.canModerate);
  return (
    <CommunityView
      communityId={community.id}
      backHref="/communities"
      title={name}
      iconUrl={community.iconUrl}
      tag={community.tag}
      channels={data.channels.map((c) => ({ id: c.id, key: c.key, name: c.name, modOnly: c.modOnly }))}
      memberCount={data.memberCount}
      initialChannelMessages={data.initialMessages}
      initialThreadId={threadParam}
      initialChannelId={data.startChannel?.id}
      initialServerTime={data.initialServerTime}
      highlightMessageId={highlightMessageId}
      viewerId={user!.id}
      isMember
      viewerRole={data.role}
      roleBadges={data.roleBadges}
      mutedUntil={data.mutedUntil}
      events={[
        ...data.communityEvents.map((e) => ({ id: e.id, name: e.title, startAt: e.startsAt.toISOString(), status: "EVENT", href: `${here}/events/${e.id}`, going: e.going })),
        ...data.events.map((e) => ({ id: e.id, name: e.name, startAt: e.startAt.toISOString(), status: e.status, href: `/tournaments/${e.id}` })),
      ].sort((a, b) => a.startAt.localeCompare(b.startAt))}
      menu={{
        communityId: community.id,
        communityName: name,
        canInvite,
        aboutHref: `${here}?view=about`,
        settingsHref: data.canModerate ? `${here}/settings` : undefined,
        hostHref: data.canModerate && community.kind !== "GLOBAL" ? `/tournaments/new?community=${community.id}` : undefined,
        eventsHref: data.canModerate ? here : undefined,
        canLeave: community.kind !== "GLOBAL" && community.ownerId !== user!.id,
      }}
    />
  );
}
