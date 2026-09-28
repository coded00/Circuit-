/**
 * Circuit — admin bracket view, native to the admin shell. Replaces the
 * "View bracket ↗"/"Bracket ↗" links out to the player-facing
 * `/tournaments/[id]/bracket` — same real `BracketView` render (see that
 * file's own header comment for what's real vs. deliberately not
 * invented), just with admin-appropriate links: back to the admin
 * competition page, matches open in the admin match/dispute page, and
 * standings link to the admin user page instead of the public profile.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { playerRankInGame } from "@/lib/standings";
import { computeTopFragger } from "@/lib/awards";
import { asTeam, teamEntryLabels } from "@/lib/teamEntries";
import { BracketView, type BracketStructure } from "@/app/tournaments/[id]/bracket/BracketView";
import { renderLobbyStandings } from "@/app/tournaments/[id]/bracket/lobbyPage";
import { RoundRobinStandings } from "@/app/tournaments/[id]/bracket/RoundRobinStandings";
import { loadLeagueStandings } from "@/lib/roundRobinStandings";
import { DoubleElimView } from "@/app/tournaments/[id]/bracket/DoubleElimView";
import { isDoubleElimStructure } from "@/lib/doubleElim";

export default async function AdminBracketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { organizer: { select: { verified: true, user: { select: { displayName: true, handle: true } } } } },
  });
  if (!tournament) notFound();

  if (tournament.competitionStyle === "LOBBY") {
    return <div className="flex flex-1 flex-col gap-6">{await renderLobbyStandings(tournament, { backHref: `/admin/competitions/${id}` })}</div>;
  }

  if (tournament.format === "ROUND_ROBIN" || tournament.format === "SWISS") {
    const view = await loadLeagueStandings(tournament);
    if (view) {
      return (
        <div className="flex flex-1 flex-col gap-6">
          <RoundRobinStandings tournament={tournament} view={view} viewerId={null} backHref={`/admin/competitions/${id}`} matchHrefBase="/admin/matches" />
        </div>
      );
    }
  }

  if (tournament.format === "DOUBLE_ELIMINATION") {
    const bracketRow = await prisma.bracket.findUnique({ where: { tournamentId: id } });
    if (isDoubleElimStructure(bracketRow?.structure)) {
      const structure = bracketRow.structure;
      const ids = [...new Set(structure.nodes.flatMap((n) => [n.playerAId, n.playerBId]).filter((x): x is string => !!x))];
      const [people, labels, matchRows, viewer] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, handle: true } }),
        teamEntryLabels(id),
        prisma.match.findMany({ where: { tournamentId: id }, select: { id: true, status: true } }),
        Promise.resolve(null as { id: string } | null),
      ]);
      const deView = (
        <DoubleElimView
          tournament={tournament}
          structure={structure}
          people={people.map((p) => ({ ...p, displayName: labels.get(p.id)?.teamName ?? p.displayName }))}
          statuses={Object.fromEntries(matchRows.map((m) => [m.id, m.status]))}
          viewerId={viewer?.id ?? null}
          backHref={`/admin/competitions/${id}`}
          matchHrefBase="/admin/matches"
        />
      );
      return <div className="flex flex-1 flex-col gap-6">{deView}</div>;
    }
  }

  const bracket = await prisma.bracket.findUnique({ where: { tournamentId: id } });
  if (!bracket) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <Link href={`/admin/competitions/${id}`} className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
          ← Back
        </Link>
        <div className="state-block motion-fade-in">
          <h1 className="state-title">{tournament.name}</h1>
          <p className="state-description">The bracket hasn&apos;t been generated yet — it appears once registration closes.</p>
        </div>
      </div>
    );
  }

  const structure = bracket.structure as unknown as BracketStructure;
  const userIds = new Set<string>();
  for (const round of structure.rounds) {
    for (const slot of round.slots) {
      if (slot.playerAId) userIds.add(slot.playerAId);
      if (slot.playerBId) userIds.add(slot.playerBId);
    }
  }
  const rawUsers = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, displayName: true, handle: true, avatarUrl: true },
  });

  const rawMatches = await prisma.match.findMany({
    where: { tournamentId: id },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }],
    include: {
      playerA: { select: { displayName: true, handle: true, avatarUrl: true } },
      playerB: { select: { displayName: true, handle: true, avatarUrl: true } },
    },
  });

  // Team tournaments: show the team, not the captain who holds the slot.
  const labels = await teamEntryLabels(id);
  const users = rawUsers.map((u) => asTeam(u, u.id, labels));
  const matches = rawMatches.map((m) => ({
    ...m,
    playerA: asTeam(m.playerA, m.playerAId, labels),
    playerB: asTeam(m.playerB, m.playerBId, labels),
  }));

  const champion = structure.rounds[structure.totalRounds - 1]?.slots[0]?.winnerId ?? null;
  const championRank = champion ? await playerRankInGame(tournament.game, champion) : null;
  const topFragger = await computeTopFragger(id);

  return (
    <BracketView
      tournament={tournament}
      structure={structure}
      users={users}
      matches={matches}
      championRank={championRank}
      topFragger={topFragger}
      backHref={`/admin/competitions/${id}`}
      matchHrefBase="/admin/matches"
      playerHref={(userId) => `/admin/users/${userId}`}
    />
  );
}
