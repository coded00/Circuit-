/**
 * Circuit — Admin Games: the catalog organizers pick from. Each row opens
 * the game's builder (/admin/games/[id]) where its modes and formats — and
 * so every rule a competition inherits — are configured.
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { Avatar, EmptyState, PageHeader, plural, StatusBadge } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";

export default async function AdminGamesPage() {
  const games = await prisma.game.findMany({
    orderBy: { name: "asc" },
    include: {
      modes: { select: { enabled: true, _count: { select: { formats: true } } } },
      _count: { select: { tournaments: true } },
    },
  });
  const published = games.filter((g) => g.enabled && g.publishedAt).length;

  return (
    <>
      <PageHeader
        title="Games"
        description={`${plural(games.length, "game")} · ${published} published. Organizers only see published, active games. And only the modes and formats switched on here.`}
        actions={
          <Link href="/admin/games/new" className="btn-primary">
            <Plus size={15} /> New game
          </Link>
        }
      />

      {games.length === 0 ? (
        <EmptyState
          title="No games yet"
          description="Create a game, add its modes and formats, then publish it so organizers can run competitions for it."
          action={
            <Link href="/admin/games/new" className="btn-secondary">
              New game
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Status</th>
                <th className="text-right">Modes</th>
                <th className="text-right">Formats</th>
                <th className="text-right">Competitions</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => {
                const activeModes = g.modes.filter((m) => m.enabled).length;
                const formats = g.modes.reduce((n, m) => n + m._count.formats, 0);
                const status = !g.enabled
                  ? { tone: "neutral" as const, label: "Inactive" }
                  : g.publishedAt
                    ? { tone: "success" as const, label: "Published" }
                    : { tone: "attention" as const, label: "Draft" };
                return (
                  <RowLink key={g.id} href={`/admin/games/${g.id}`}>
                    <td>
                      <Link href={`/admin/games/${g.id}`} className="flex items-center gap-3">
                        <Avatar name={g.name} src={g.iconUrl ?? g.coverUrl} size={32} square />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate font-medium text-foreground">{g.name}</span>
                          <span className="truncate text-[12px] text-muted">
                            {[g.category, g.platforms.join(", ")].filter(Boolean).join(" · ") || "No category yet"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <StatusBadge tone={status.tone} dot={status.label === "Published"}>
                        {status.label}
                      </StatusBadge>
                    </td>
                    <td className="text-right">
                      {activeModes}
                      {activeModes !== g.modes.length && <span className="text-muted-strong">/{g.modes.length}</span>}
                    </td>
                    <td className="text-right">{formats}</td>
                    <td className="text-right text-muted">{g._count.tournaments}</td>
                  </RowLink>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
