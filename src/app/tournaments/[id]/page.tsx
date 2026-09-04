/**
 * Circuit — public tournament page (Build Plan P1-2, maps: TRN-2, TRN-3).
 *
 * No login required — every field here must be visible to a guest, per
 * TRN-3's acceptance criteria.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    notFound();
  }

  const registrantCount = await prisma.registration.count({
    where: { tournamentId: tournament.id, status: "CONFIRMED" },
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {tournament.status.replace("_", " ")}
        </span>
        <h1 className="text-3xl font-semibold">{tournament.name}</h1>
        <p className="text-zinc-500">{tournament.game} · Single-elimination knockout</p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded border border-black/10 p-4 dark:border-white/15 sm:grid-cols-4">
        <div>
          <div className="text-xs text-zinc-500">Entry fee</div>
          <div className="font-medium">
            {tournament.entryFee === 0 ? "Free" : formatNaira(tournament.entryFee)}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Prize</div>
          <div className="font-medium">
            {tournament.prizeAmount ? formatNaira(tournament.prizeAmount) : tournament.prizeText ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Registrants</div>
          <div className="font-medium">
            {registrantCount} / {tournament.participantCap}
          </div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Starts</div>
          <div className="font-medium">{formatDate(tournament.startAt)}</div>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-sm text-zinc-500">
        <span>Registration opens {formatDate(tournament.registrationOpenAt)}</span>
        <span>Registration closes {formatDate(tournament.registrationCloseAt)}</span>
      </div>

      {tournament.prizeText && tournament.prizeAmount ? (
        <p className="text-sm text-zinc-500">{tournament.prizeText}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Rules</h2>
        <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
          {tournament.rulesText}
        </p>
      </div>
    </div>
  );
}
