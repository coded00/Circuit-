/**
 * Circuit — Teams overview. Real `Team`/`TeamMembership` rows (see those
 * models' schema comments) — the teams you captain or belong to, and any
 * pending invites waiting on you.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { CreateTeamForm } from "@/components/teams/CreateTeamForm";
import { TeamInviteRow } from "@/components/teams/TeamInviteRow";

export default async function TeamsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/teams");
  }

  const [captained, memberships, invites] = await Promise.all([
    prisma.team.findMany({ where: { captainId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.teamMembership.findMany({
      where: { userId: user.id, accepted: true },
      include: { team: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.teamMembership.findMany({
      where: { userId: user.id, accepted: false },
      include: { team: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const myTeams = [
    ...captained.map((t) => ({ ...t, isCaptain: true })),
    ...memberships.map((m) => ({ ...m.team, isCaptain: false })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Teams</h1>
        <p className="text-sm text-muted">A persistent squad — not a tournament registration, just your crew.</p>
      </div>

      <div className="card">
        <CreateTeamForm />
      </div>

      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-section-heading">Invites ({invites.length})</h2>
          <div className="flex flex-col gap-2">
            {invites.map((m) => (
              <TeamInviteRow key={m.id} teamId={m.teamId} teamName={m.team.name} tag={m.team.tag} viewerId={user.id} />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-section-heading">My Teams ({myTeams.length})</h2>
        {myTeams.length === 0 ? (
          <p className="card text-center text-muted">Not on a team yet — create one above.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {myTeams.map((t) => (
              <Link key={t.id} href={`/teams/${t.id}`} className="card-row flex items-center gap-3 p-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{t.name}</span>
                  {t.tag && <span className="text-metadata">[{t.tag}]</span>}
                </div>
                {t.isCaptain && <span className="badge badge-brand shrink-0">Captain</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
