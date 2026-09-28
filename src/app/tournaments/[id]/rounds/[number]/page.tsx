/**
 * Circuit — enter or correct one lobby round's results (organizer or
 * staff). See src/lib/lobby.ts.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { loginPath } from "@/lib/safeRedirect";
import { canManageLobby, loadLobby } from "@/lib/lobby";
import { describePoints } from "@/lib/lobbyScoring";
import { RoundResultsForm } from "./RoundResultsForm";

export const metadata: Metadata = { title: "Enter results", robots: { index: false, follow: false } };

export default async function RoundResultsPage({ params }: { params: Promise<{ id: string; number: string }> }) {
  const { id, number } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(loginPath(`/tournaments/${id}/rounds/${number}`));
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament || tournament.competitionStyle !== "LOBBY") notFound();
  if (!canManageLobby(user, tournament)) redirect(`/tournaments/${id}/bracket`);
  const view = await loadLobby(tournament);
  const round = view.rounds.find((r) => r.number === Number(number));
  if (!round) notFound();
  const back = `/tournaments/${id}/bracket?tab=rounds`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1.5">
        <Link href={back} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
          <ArrowLeft size={15} /> {tournament.name}
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{round.label} results</h1>
        <p className="text-sm text-muted">Scoring: {describePoints(view.table)}.</p>
      </div>
      {tournament.status !== "LIVE" || (round.stage === "GROUP" && view.stage === "FINAL") ? (
        <p className="card text-sm text-muted">
          {tournament.status === "COMPLETE"
            ? "Results are final — this tournament is complete."
            : tournament.status === "LIVE"
              ? "The final has started — group results are locked."
              : "The lobby hasn't started yet."}
        </p>
      ) : (
        <RoundResultsForm
          tournamentId={id}
          roundNumber={round.number}
          table={view.table}
          entries={view.entries.filter((e) => round.entryIds.includes(e.registrationId)).map((e) => ({ registrationId: e.registrationId, name: e.name, tag: e.tag, sub: e.roster.length ? e.roster.map((m) => m.displayName).join(", ") : `@${e.handle}`, inGameId: e.inGameId }))}
          initial={round.results.map((r) => ({ registrationId: r.registrationId, placement: r.placement, kills: r.kills }))}
          initialProofUrl={round.proofUrl}
          backHref={back}
          openFlags={round.flags.filter((f) => f.status === "OPEN" || f.status === "ESCALATED").length}
        />
      )}
    </div>
  );
}
