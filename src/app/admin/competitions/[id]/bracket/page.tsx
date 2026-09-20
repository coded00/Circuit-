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
import { BracketView, type BracketStructure } from "@/app/tournaments/[id]/bracket/BracketView";

export default async function AdminBracketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { organizer: { select: { verified: true, user: { select: { displayName: true, handle: true } } } } },
  });
  if (!tournament) notFound();

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
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, displayName: true, handle: true, avatarUrl: true },
  });

  const matches = await prisma.match.findMany({
    where: { tournamentId: id },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }],
    include: {
      playerA: { select: { displayName: true, handle: true, avatarUrl: true } },
      playerB: { select: { displayName: true, handle: true, avatarUrl: true } },
    },
  });

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
