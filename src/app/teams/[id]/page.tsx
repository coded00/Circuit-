/**
 * Circuit — Team detail. Roster, captain-only invite/settings/disband,
 * or a leave button for anyone else on the team. See `Team`/
 * `TeamMembership`'s own schema comments for the underlying model.
 */

import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { teamRoleFor } from "@/lib/teams";
import { MemberRow } from "@/components/teams/MemberRow";
import { InviteMemberForm } from "@/components/teams/InviteMemberForm";
import { TeamSettingsForm } from "@/components/teams/TeamSettingsForm";
import { TeamActionButton } from "@/components/teams/TeamActionButton";
import { TeamInviteBanner } from "@/components/teams/TeamInviteBanner";

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/teams/${id}`)}`);
  }

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      captain: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
      members: {
        include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!team) notFound();

  const role = await teamRoleFor(id, user.id);
  const isCaptain = role.role === "captain";
  const isInvited = role.role === "invited";

  const acceptedMembers = team.members.filter((m) => m.accepted && m.userId !== team.captainId);
  const pendingMembers = team.members.filter((m) => !m.accepted);
  // `team.members` already includes the captain's own membership row
  // (created alongside the team), so its length alone is the real total.
  const totalMembers = team.members.length;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {team.name}
          {team.tag && <span className="text-muted"> [{team.tag}]</span>}
        </h1>
        <p className="text-sm text-muted">{totalMembers} member{totalMembers === 1 ? "" : "s"}</p>
      </div>

      {isInvited && <TeamInviteBanner teamId={id} viewerId={user.id} />}

      <div className="flex flex-col gap-2">
        <h2 className="text-section-heading">Roster</h2>
        <div className="flex flex-col gap-2">
          <MemberRow teamId={id} person={team.captain} isCaptain isPending={false} canRemove={false} />
          {acceptedMembers.map((m) => (
            <MemberRow key={m.id} teamId={id} person={m.user} isCaptain={false} isPending={false} canRemove={isCaptain} />
          ))}
          {pendingMembers.map((m) => (
            <MemberRow key={m.id} teamId={id} person={m.user} isCaptain={false} isPending canRemove={isCaptain} />
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
            <TeamSettingsForm teamId={id} name={team.name} tag={team.tag} />
          </div>
        </>
      )}

      <div className="flex justify-end">
        {isCaptain && <TeamActionButton teamId={id} userId={user.id} kind="disband" />}
        {role.role === "member" && <TeamActionButton teamId={id} userId={user.id} kind="leave" />}
      </div>
    </div>
  );
}
