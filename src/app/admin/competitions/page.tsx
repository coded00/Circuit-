/**
 * Circuit — Admin Competitions (Phase 2). Every real Tournament, with
 * admin-capable actions on top of the same real routes the organizer
 * dashboard already uses (Edit, Manage Players, Cancel) — their auth
 * gates now also accept staff, not just each tournament's own organizer,
 * rather than duplicating that logic here. Bracket is admin-native
 * (`/admin/competitions/[id]/bracket`, same `BracketView` the
 * player-facing page renders).
 */

import Link from "next/link";
import type { Prisma, TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { CancelTournamentButton } from "@/components/admin/CancelTournamentButton";

type SearchParams = { q?: string; status?: string; game?: string };

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_OPTIONS: { value: TournamentStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
  { value: "LIVE", label: "Live" },
  { value: "COMPLETE", label: "Complete" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function AdminCompetitionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, status, game } = await searchParams;

  const and: Prisma.TournamentWhereInput[] = [];
  if (q?.trim()) and.push({ name: { contains: q.trim(), mode: "insensitive" } });
  if (status) and.push({ status: status as TournamentStatus });
  if (game?.trim()) and.push({ game: { contains: game.trim(), mode: "insensitive" } });
  const where: Prisma.TournamentWhereInput = and.length ? { AND: and } : {};

  const tournaments = await prisma.tournament.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      game: true,
      status: true,
      entryFee: true,
      prizeAmount: true,
      prizeText: true,
      participantCap: true,
      startAt: true,
      registrationCloseAt: true,
      fundsFrozen: true,
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
    },
  });

  const hasFilters = !!(q || status || game);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">Competitions</h1>
          <p className="text-sm text-muted">{tournaments.length.toLocaleString("en-NG")} tournaments.</p>
        </div>
        <Link href="/admin/competitions/new" className="btn-primary">
          + Create
        </Link>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Tournament name" className="field-input" />
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="game">
            Game
          </label>
          <input id="game" name="game" defaultValue={game ?? ""} placeholder="e.g. Valorant" className="field-input" />
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {hasFilters && (
          <Link href="/admin/competitions" className="text-xs font-medium text-accent-volt hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      {tournaments.length === 0 ? (
        <div className="card flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm text-muted">No competitions match those filters.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Competition</th>
                <th>Game</th>
                <th>Players</th>
                <th>Prize</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => {
                const statusInfo = tournamentStatusInfo(t.status);
                // Matches tournaments/[id]/cancel/route.ts's own guard —
                // see admin/competitions/[id]/page.tsx's own comment on
                // why this doesn't also check startAt.
                const cancellable = t.status !== "CANCELLED" && t.status !== "COMPLETE" && !t.fundsFrozen;
                return (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/admin/competitions/${t.id}`} className="font-medium hover:text-accent-volt">
                        {t.name}
                      </Link>
                    </td>
                    <td className="text-muted">{t.game}</td>
                    <td className="font-mono tabular-nums">
                      {t._count.registrations} / {t.participantCap}
                    </td>
                    <td className="font-mono tabular-nums text-gold">
                      {t.prizeAmount ? formatNaira(t.prizeAmount) : t.prizeText || "—"}
                    </td>
                    <td>
                      <StatusPill tone={statusInfo.tone} pulse={statusInfo.pulse}>
                        {statusInfo.label}
                      </StatusPill>
                    </td>
                    <td className="text-muted">{formatDate(t.startAt)}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <Link href={`/admin/competitions/${t.id}/edit`} className="text-xs font-medium text-accent-blue hover:underline">
                          Edit
                        </Link>
                        <Link href={`/admin/competitions/${t.id}`} className="text-xs font-medium text-accent-blue hover:underline">
                          Manage
                        </Link>
                        <Link href={`/admin/competitions/${t.id}/bracket`} className="text-xs font-medium text-accent-blue hover:underline">
                          Bracket
                        </Link>
                        {cancellable && <CancelTournamentButton tournamentId={t.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
