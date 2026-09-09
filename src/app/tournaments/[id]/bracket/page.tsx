/**
 * Circuit — live bracket view (Build Plan P3-9, maps: BRK-7).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import Poller from "@/app/Poller";
import { StatusPill } from "@/components/StatusPill";

type BracketSlot = {
  position: number;
  matchId: string | null;
  playerAId: string | null;
  playerBId: string | null;
  winnerId: string | null;
};
type BracketRound = { round: number; slots: BracketSlot[] };
type BracketStructure = { bracketSize: number; totalRounds: number; rounds: BracketRound[] };

export default async function BracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) notFound();

  const bracket = await prisma.bracket.findUnique({ where: { tournamentId: id } });
  if (!bracket) {
    return (
      <div className="state-block">
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
    select: { id: true, displayName: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  function label(userId: string | null): string {
    if (!userId) return "TBD";
    return userMap.get(userId)?.displayName ?? "Unknown";
  }

  const champion = structure.rounds[structure.totalRounds - 1]?.slots[0]?.winnerId ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <Poller />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <Link href={`/tournaments/${id}`} className="text-sm font-medium text-brand-blue hover:underline">
            ← {tournament.name}
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Bracket</h1>
        </div>
        {champion && (
          <StatusPill tone="complete" size="md">
            <Trophy size={14} />
            Champion: {label(champion)}
          </StatusPill>
        )}
      </div>

      {/* Rounds laid out as columns; each round's matches are spaced with
          justify-around so a match visually centers between the two
          feeder matches from the previous round — a lightweight bracket
          "tree" effect without literal connector lines/SVG. */}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max items-stretch gap-6">
          {structure.rounds.map((round) => (
            <div key={round.round} className="flex w-56 shrink-0 flex-col gap-4">
              <h2 className="text-eyebrow text-center">
                {round.round === structure.totalRounds ? "Final" : `Round ${round.round}`}
              </h2>
              <div className="flex flex-1 flex-col justify-around gap-6">
                {round.slots.map((slot) => (
                  <div key={slot.position} className="card flex flex-col gap-0 overflow-hidden p-0">
                    {[
                      { id: slot.playerAId, isWinner: slot.winnerId === slot.playerAId },
                      { id: slot.playerBId, isWinner: slot.winnerId === slot.playerBId },
                    ].map((p, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 px-3 py-2.5 text-sm ${i === 0 ? "border-b border-border" : ""} ${
                          p.isWinner ? "font-semibold text-foreground" : "text-muted"
                        }`}
                      >
                        {p.isWinner && <Trophy size={13} className="shrink-0 text-gold" />}
                        <span className="truncate">{label(p.id)}</span>
                      </div>
                    ))}
                    {slot.matchId && (
                      <Link
                        href={`/matches/${slot.matchId}`}
                        className="border-t border-border px-3 py-1.5 text-xs font-medium text-brand-blue hover:underline"
                      >
                        View match →
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
