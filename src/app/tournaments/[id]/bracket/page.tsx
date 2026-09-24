/**
 * Circuit — live bracket view (Build Plan P3-9, maps: BRK-7). Thin
 * data-fetcher; the real tab shell (Bracket / Matches / Standings /
 * About) and Champion sidebar live in `BracketView.tsx`, shared with the
 * admin-native bracket page at `/admin/competitions/[id]/bracket` — see
 * that file's own header comment for what's real vs. deliberately not
 * invented (round names, standings, no per-match score split, etc.).
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Poller from "@/app/Poller";
import { playerRankInGame } from "@/lib/standings";
import { computeTopFragger } from "@/lib/awards";
import { BracketView, type BracketStructure } from "./BracketView";

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    include: { organizer: { select: { verified: true, user: { select: { displayName: true, handle: true } } } } },
  });
  if (!tournament) notFound();

  const bracket = await prisma.bracket.findUnique({ where: { tournamentId: id } });
  if (!bracket) {
    return (
      <div className="state-block motion-fade-in">
        {/* Same live-page treatment as once the bracket exists below —
            no reason a viewer waiting for registration to close should
            need a manual refresh to see it appear. */}
        <Poller />
        <h1 className="state-title">{tournament.name}</h1>
        <p className="state-description">
          The bracket hasn&apos;t been generated yet — it appears once registration closes.
        </p>
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <Poller />
      <BracketView
        tournament={tournament}
        structure={structure}
        users={users}
        matches={matches}
        championRank={championRank}
        topFragger={topFragger}
        backHref={`/tournaments/${id}`}
        matchHrefBase="/matches"
        playerHref={(_userId, handle) => `/players/${handle}`}
        tournamentHref={`/tournaments/${id}`}
        shareUrl={`${process.env.NEXT_PUBLIC_APP_URL}/tournaments/${id}/bracket`}
      />
    </div>
  );
}
