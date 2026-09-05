/**
 * Circuit — live bracket view (Build Plan P3-9, maps: BRK-7).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Poller from "@/app/Poller";

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
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">{tournament.name}</h1>
        <p className="text-zinc-500">
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
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-16">
      <Poller />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{tournament.name} — Bracket</h1>
        {champion && <p className="text-sm font-medium text-zinc-500">Champion: {label(champion)}</p>}
      </div>

      <div className="flex gap-8 overflow-x-auto pb-4">
        {structure.rounds.map((round) => (
          <div key={round.round} className="flex min-w-[220px] flex-col gap-4">
            <h2 className="text-sm font-medium text-zinc-500">
              {round.round === structure.totalRounds ? "Final" : `Round ${round.round}`}
            </h2>
            {round.slots.map((slot) => (
              <div
                key={slot.position}
                className="flex flex-col gap-1 rounded border border-black/10 p-3 text-sm dark:border-white/15"
              >
                <div className={slot.winnerId === slot.playerAId ? "font-semibold" : ""}>
                  {label(slot.playerAId)}
                </div>
                <div className={slot.winnerId === slot.playerBId ? "font-semibold" : ""}>
                  {label(slot.playerBId)}
                </div>
                {slot.matchId && (
                  <Link href={`/matches/${slot.matchId}`} className="mt-1 text-xs underline">
                    View match
                  </Link>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
