import { notFound, redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { captainTeamOptions, describeRoster, rosterBounds } from "@/lib/teamEntries";
import RegistrationForm from "./RegistrationForm";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath(`/tournaments/${id}/register`));
  }

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    notFound();
  }
  const isTeam = tournament.entryType === "TEAM";
  const bounds = rosterBounds(tournament);
  const teamOptions = isTeam ? await captainTeamOptions(user.id, tournament.id) : [];
  const savedName = tournament.gameId
    ? (await prisma.userGameName.findUnique({ where: { userId_gameId: { userId: user.id, gameId: tournament.gameId } }, select: { name: true } }))?.name ?? null
    : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {isTeam ? "Enter your team in" : "Register for"} {tournament.name}
        </h1>
        {isTeam && (
          <p className="text-sm text-muted">
            {tournament.modeName ?? tournament.teamSize} · teams of {tournament.playersPerTeam} · roster of {describeRoster(bounds)}
          </p>
        )}
        <p className="text-sm text-muted">
          {tournament.entryFee === 0
            ? "This tournament is free to enter."
            : `Entry fee: ₦ ${(tournament.entryFee / 100).toLocaleString("en-NG")} — you'll be redirected to pay after submitting.`}
        </p>
      </div>
      <div className="card">
        <RegistrationForm
          tournamentId={tournament.id}
          entryFee={tournament.entryFee}
          walletBalance={user.walletBalance}
          username={user.handle}
          savedName={savedName}
          team={isTeam ? { options: teamOptions, bounds, profileHref: `/players/${user.handle}?tab=teams`, hasPrize: (tournament.prizeAmount ?? 0) > 0 } : undefined}
        />
      </div>
    </div>
  );
}
