/**
 * Circuit — Admin Quick Matches. Clones /admin/challenges' own shell
 * (searchParams-driven filters, StatusPill, plain-GET form) exactly, for
 * every QuickMatchChallenge.
 */

import Link from "next/link";
import type { Prisma, QuickMatchStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { StatusPill, quickMatchStatusInfo } from "@/components/StatusPill";

type SearchParams = { q?: string; status?: string };

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_OPTIONS: { value: QuickMatchStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Searching" },
  { value: "ACCEPTED", label: "Matched" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function AdminQuickMatchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, status } = await searchParams;

  const and: Prisma.QuickMatchChallengeWhereInput[] = [];
  if (q?.trim()) and.push({ game: { contains: q.trim(), mode: "insensitive" } });
  if (status) and.push({ status: status as QuickMatchStatus });
  const where: Prisma.QuickMatchChallengeWhereInput = and.length ? { AND: and } : {};

  const challenges = await prisma.quickMatchChallenge.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      host: { select: { displayName: true } },
      acceptedBy: { select: { displayName: true } },
      _count: { select: { recipients: true } },
    },
  });

  const hasFilters = !!(q || status);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Quick Matches</h1>
        <p className="text-sm text-muted">{challenges.length.toLocaleString("en-NG")} Quick Matches.</p>
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
          <Link href="/admin/quick-matches" className="text-xs font-medium text-accent-volt hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      {challenges.length === 0 ? (
        <div className="card flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm text-muted">No Quick Matches match those filters.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Host</th>
                <th>Recipients</th>
                <th>Accepted by</th>
                <th>Entry</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => {
                const statusInfo = quickMatchStatusInfo(c.status);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/admin/quick-matches/${c.id}`} className="font-medium hover:text-accent-volt">
                        {c.game}
                      </Link>
                    </td>
                    <td className="text-muted">{c.host.displayName}</td>
                    <td className="text-muted">{c._count.recipients}</td>
                    <td className="text-muted">{c.acceptedBy?.displayName ?? "—"}</td>
                    <td className="font-mono tabular-nums">{c.stakeAmount === 0 ? "Free" : formatNaira(c.stakeAmount)}</td>
                    <td>
                      <StatusPill tone={statusInfo.tone} pulse={statusInfo.pulse}>
                        {statusInfo.label}
                      </StatusPill>
                    </td>
                    <td className="text-muted">{formatDate(c.createdAt)}</td>
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
