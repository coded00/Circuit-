/**
 * Circuit — Team detail. Roster, captain-only invite/settings/disband,
 * or a leave button for anyone else on the team. See `Team`/
 * `TeamMembership`'s own schema comments for the underlying model.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loginPath } from "@/lib/safeRedirect";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { buildMetadata, SITE_URL } from "@/lib/seo";
import { ShareButton } from "@/components/ShareButton";
import { teamRoleFor } from "@/lib/teams";
import { communityHref } from "@/lib/community";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { MemberRow } from "@/components/teams/MemberRow";
import { InviteMemberForm } from "@/components/teams/InviteMemberForm";
import { TeamSettingsForm } from "@/components/teams/TeamSettingsForm";
import { TeamActionButton } from "@/components/teams/TeamActionButton";
import { TeamInviteBanner } from "@/components/teams/TeamInviteBanner";
import { TeamMembershipButton } from "@/components/teams/TeamMembershipButton";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const team = await prisma.team.findUnique({
    where: { id },
    select: { name: true, tag: true, game: true, captain: { select: { handle: true } }, _count: { select: { members: { where: { accepted: true } } } } },
  });
  if (!team) return buildMetadata({ title: "Team not found", description: "This team doesn't exist on Circuit.", path: `/teams/${id}`, noindex: true });
  const members = team._count.members;
  return buildMetadata({
    title: `${team.name}${team.tag ? ` [${team.tag}]` : ""} — Circuit team`,
    description: `${team.name}${team.game ? `, a ${team.game} team` : ""} on Circuit. ${members} player${members === 1 ? "" : "s"}, captained by @${team.captain.handle}. See the roster and join the Circuit.`,
    path: `/teams/${id}`,
  });
}

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Public: a shared team link has to open for people who aren't signed in.
  const user = await getCurrentUser();

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      captain: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
      members: {
        include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
      communities: {
        where: { community: { enabled: true } },
        include: { community: { select: { id: true, name: true, slug: true, iconUrl: true, tag: true, kind: true, tournamentId: true } } },
      },
    },
  });
  if (!team) notFound();

  const role: Awaited<ReturnType<typeof teamRoleFor>> = user ? await teamRoleFor(id, user.id) : { role: "none" };
  const isCaptain = role.role === "captain";
  const isInvited = role.role === "invited";

  const acceptedMembers = team.members.filter((m) => m.accepted && m.userId !== team.captainId);
  // Invites and join requests are private: the captain sees them all, an invited or requesting player sees their own.
  const pendingMembers = team.members.filter((m) => !m.accepted && (isCaptain || m.userId === user?.id));
  // `team.members` already includes the captain's own membership row
  // (created alongside the team), so its length alone is the real total.
  const totalMembers = team.members.length;

  const communitiesSection = team.communities.length > 0 && (
    <section className="flex flex-col gap-2">
      <h2 className="text-eyebrow">Communities</h2>
      <div className="flex flex-wrap gap-2">
        {team.communities.map(({ community: c }) => (
          <Link key={c.id} href={communityHref(c)} className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1 text-sm font-medium transition hover:border-border-hover">
            <CommunityAvatar name={c.name ?? "?"} iconUrl={c.iconUrl} tag={c.tag} size="sm" className="!h-7 !w-7 !rounded-full" />
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {team.name}
            {team.tag && <span className="text-muted"> [{team.tag}]</span>}
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>
              {totalMembers} member{totalMembers === 1 ? "" : "s"}
            </span>
            {team.game && <span>{team.game}</span>}
            {team.region && <span>{team.region}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareButton title={`Check out ${team.name} on Circuit`} url={`${SITE_URL}/teams/${id}`} />
          {!user && (
            <Link href={loginPath(`/teams/${id}`)} className="btn-primary">
              Sign in to join
            </Link>
          )}
          {user && role.role === "none" && <TeamMembershipButton teamId={id} viewerId={user.id} status={{ state: "none" }} />}
          {user && role.role === "requested" && (
            <TeamMembershipButton teamId={id} viewerId={user.id} status={{ state: "requested", membershipId: role.membershipId }} />
          )}
        </div>
      </div>

      {communitiesSection}

      {isInvited && user && <TeamInviteBanner teamId={id} viewerId={user.id} />}

      <div className="flex flex-col gap-2">
        <h2 className="text-section-heading">Roster</h2>
        <div className="flex flex-col gap-2">
          <MemberRow teamId={id} person={team.captain} isCaptain isPending={false} canRemove={false} />
          {acceptedMembers.map((m) => (
            <MemberRow key={m.id} teamId={id} person={m.user} isCaptain={false} isPending={false} canRemove={isCaptain} />
          ))}
          {pendingMembers.map((m) => (
            <MemberRow
              key={m.id}
              teamId={id}
              person={m.user}
              isCaptain={false}
              isPending
              isJoinRequest={m.requestedByMember}
              canRemove={isCaptain || m.userId === user?.id}
              canAccept={isCaptain && m.requestedByMember}
            />
          ))}
        </div>
      </div>

      {isCaptain && (
        <>
          <div className="card flex flex-col gap-2">
            <h2 className="text-card-title">Invite a player</h2>
            <InviteMemberForm teamId={id} />
          </div>

          <div className="card flex flex-col gap-2">
            <h2 className="text-card-title">Team settings</h2>
            <TeamSettingsForm teamId={id} name={team.name} tag={team.tag} game={team.game} region={team.region} />
          </div>
        </>
      )}

      <div className="flex justify-end">
        {isCaptain && user && <TeamActionButton teamId={id} userId={user.id} kind="disband" />}
        {role.role === "member" && user && <TeamActionButton teamId={id} userId={user.id} kind="leave" />}
      </div>
    </div>
  );
}
