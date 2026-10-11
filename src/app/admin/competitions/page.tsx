/**
 * Circuit — Admin Competitions: every tournament, paginated and
 * filterable (status, game, frozen funds). A row opens its detail page,
 * where the actions live (edit, bracket, freeze, cancel) — the list
 * itself carries no destructive buttons.
 */

import Link from "next/link";
import type { Prisma, TournamentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Plus } from "lucide-react";
import { getStructure } from "@/lib/competitionStructures";
import { EmptyState, Field, FilterBar, naira, PageHeader, Pagination, plural, StatusBadge, TournamentStatusBadge } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";

type SearchParams = { q?: string; status?: string; game?: string; frozen?: string; page?: string };

const PAGE_SIZE = 30;

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_OPTIONS: { value: TournamentStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Registration open" },
  { value: "CLOSED", label: "Registration closed" },
  { value: "LIVE", label: "Live" },
  { value: "COMPLETE", label: "Complete" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function AdminCompetitionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, status, game, frozen, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const and: Prisma.TournamentWhereInput[] = [];
  if (q?.trim()) and.push({ name: { contains: q.trim(), mode: "insensitive" } });
  if (status) and.push({ status: status as TournamentStatus });
  if (game?.trim()) and.push({ game: { contains: game.trim(), mode: "insensitive" } });
  if (frozen === "1") and.push({ fundsFrozen: true });
  const where: Prisma.TournamentWhereInput = and.length ? { AND: and } : {};

  const [total, tournaments] = await Promise.all([
    prisma.tournament.count({ where }),
    prisma.tournament.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        game: true,
        teamSize: true,
        format: true,
        status: true,
        entryFee: true,
        prizeAmount: true,
        prizeText: true,
        participantCap: true,
        startAt: true,
        fundsFrozen: true,
        organizer: { select: { user: { select: { displayName: true } } } },
        _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
      },
    }),
  ]);

  const hasFilters = !!(q || status || game || frozen);
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (game) params.set("game", game);
    if (frozen) params.set("frozen", frozen);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/admin/competitions?${qs}` : "/admin/competitions";
  };

  return (
    <>
      <PageHeader
        title="Competitions"
        description={`${plural(total, "tournament")}${hasFilters ? " match these filters" : ""}.`}
        actions={
          <Link href="/admin/competitions/new" className="btn-primary">
            <Plus size={15} /> New competition
          </Link>
        }
      />

      <FilterBar
        extra={
          hasFilters && (
            <Link href="/admin/competitions" className="text-[12px] font-medium text-muted hover:text-foreground">
              Clear
            </Link>
          )
        }
      >
        <Field label="Search" grow htmlFor="q">
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Tournament name" className="field-input" />
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Game" htmlFor="game">
          <input id="game" name="game" defaultValue={game ?? ""} placeholder="e.g. Valorant" className="field-input" />
        </Field>
        <Field label="Funds" htmlFor="frozen">
          <select id="frozen" name="frozen" defaultValue={frozen ?? ""} className="field-select">
            <option value="">Any</option>
            <option value="1">Frozen only</option>
          </select>
        </Field>
      </FilterBar>

      {tournaments.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No competitions match these filters" : "No competitions yet"}
          description={hasFilters ? "Try a broader search or clear the filters." : "Tournaments organizers create show up here."}
          action={
            !hasFilters && (
              <Link href="/admin/competitions/new" className="btn-secondary">
                New competition
              </Link>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Competition</th>
                  <th>Format</th>
                  <th className="text-right">Entries</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Prize</th>
                  <th>Status</th>
                  <th className="text-right">Starts</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => (
                  <RowLink key={t.id} href={`/admin/competitions/${t.id}`}>
                    <td className="max-w-[320px]">
                      <Link href={`/admin/competitions/${t.id}`} className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate font-medium text-foreground">{t.name}</span>
                        <span className="truncate text-[12px] text-muted">
                          {t.game} · by {t.organizer.user.displayName}
                        </span>
                      </Link>
                    </td>
                    <td className="text-muted">
                      <span className="flex flex-col leading-tight">
                        <span className="text-foreground">{getStructure(t.format)?.label ?? t.format}</span>
                        <span className="text-[12px]">{t.teamSize}</span>
                      </span>
                    </td>
                    <td className="text-right">
                      {t._count.registrations}
                      <span className="text-muted-strong">/{t.participantCap}</span>
                    </td>
                    <td className="text-right">{t.entryFee ? naira(t.entryFee) : <span className="text-muted">Free</span>}</td>
                    <td className="text-right">{t.prizeAmount ? naira(t.prizeAmount) : <span className="text-muted">{t.prizeText ? "Non-cash" : "—"}</span>}</td>
                    <td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <TournamentStatusBadge status={t.status} />
                        {t.fundsFrozen && <StatusBadge tone="attention">Funds frozen</StatusBadge>}
                      </span>
                    </td>
                    <td className="text-right text-muted">{formatDate(t.startAt)}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={pageHref} />
        </div>
      )}
    </>
  );
}
