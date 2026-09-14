/**
 * Circuit — Admin Challenges (Phase 3). Every real Battle. "Challenger"
 * isn't a field on Battle itself (only `creatorId`/`targetUserId` for a
 * targeted invite) — once someone accepts an open Battle, `createBattleMatch`
 * (src/lib/matches.ts) creates the real Match that pairs them with the
 * creator, so the challenger here is read off that Match's non-creator
 * player, real data derived from a real relation, not a fabricated column.
 */

import Link from "next/link";
import type { Prisma, BattleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { StatusPill, battleStatusInfo } from "@/components/StatusPill";

type SearchParams = { q?: string; status?: string };

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_OPTIONS: { value: BattleStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "ACCEPTED", label: "Active" },
  { value: "COMPLETE", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function AdminChallengesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, status } = await searchParams;

  const and: Prisma.BattleWhereInput[] = [];
  if (q?.trim()) and.push({ game: { contains: q.trim(), mode: "insensitive" } });
  if (status) and.push({ status: status as BattleStatus });
  const where: Prisma.BattleWhereInput = and.length ? { AND: and } : {};

  const battles = await prisma.battle.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      creator: { select: { displayName: true } },
      matches: {
        take: 1,
        include: {
          playerA: { select: { displayName: true } },
          playerB: { select: { displayName: true } },
        },
      },
    },
  });

  const hasFilters = !!(q || status);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Challenges</h1>
        <p className="text-sm text-muted">{battles.length.toLocaleString("en-NG")} challenges.</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="q">
            Game
          </label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="e.g. Valorant" className="field-input" />
        </div>
        <div className="flex min-w-[160px] flex-col gap-1.5">
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
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {hasFilters && (
          <Link href="/admin/challenges" className="text-xs font-medium text-accent-volt hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      {battles.length === 0 ? (
        <div className="card flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm text-muted">No challenges match those filters.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Host</th>
                <th>Challenger</th>
                <th>Entry</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {battles.map((b) => {
                const statusInfo = battleStatusInfo(b.status);
                const match = b.matches[0];
                const challenger = match
                  ? match.playerAId === b.creatorId
                    ? match.playerB.displayName
                    : match.playerA.displayName
                  : null;
                return (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/admin/challenges/${b.id}`} className="font-medium hover:text-accent-volt">
                        {b.game}
                      </Link>
                    </td>
                    <td className="text-muted">{b.creator.displayName}</td>
                    <td className="text-muted">{challenger ?? "—"}</td>
                    <td className="font-mono tabular-nums">{b.stakeAmount === 0 ? "Free" : formatNaira(b.stakeAmount)}</td>
                    <td>
                      <StatusPill tone={statusInfo.tone} pulse={statusInfo.pulse}>
                        {statusInfo.label}
                      </StatusPill>
                    </td>
                    <td className="text-muted">{formatDate(b.createdAt)}</td>
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
