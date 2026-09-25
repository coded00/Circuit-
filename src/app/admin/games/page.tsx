/**
 * Circuit — Admin Games: the catalog organizers pick from. Each game opens
 * into its builder (/admin/games/[id]) where its modes and formats — and so
 * every rule a competition inherits — are configured.
 */

import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { GameArtTile } from "@/components/GameArtTile";

export default async function AdminGamesPage() {
  const games = await prisma.game.findMany({
    orderBy: { name: "asc" },
    include: { modes: { select: { enabled: true, _count: { select: { formats: true } } } } },
  });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">Games</h1>
          <p className="max-w-xl text-sm text-muted">
            Every game, its modes and formats. Organizers only see published, active games — and only the modes and formats you switch on here.
          </p>
        </div>
        <Link href="/admin/games/new" className="btn-primary text-sm">
          <Plus size={15} /> Create game
        </Link>
      </div>

      {games.length === 0 ? (
        <div className="card flex flex-col items-center gap-1 py-14 text-center">
          <p className="text-sm font-semibold">No games yet</p>
          <p className="text-xs text-muted">Create a game, add its modes and formats, then publish it.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {games.map((g) => {
            const modeCount = g.modes.length;
            const formatCount = g.modes.reduce((n, m) => n + m._count.formats, 0);
            const status = !g.enabled ? { label: "Inactive", dot: "bg-muted" } : g.publishedAt ? { label: "Published", dot: "bg-success" } : { label: "Draft", dot: "bg-warning" };
            return (
              <Link key={g.id} href={`/admin/games/${g.id}`} className="card-media group flex flex-col">
                <GameArtTile game={g.name} posterUrl={g.coverUrl ?? g.iconUrl} className="aspect-[16/7] w-full" hideLabel imgWidth={640}>
                  {/* Dark backing so it reads on any cover art. */}
                  <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-[6px] bg-black/65 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden />
                    {status.label}
                  </span>
                </GameArtTile>
                <div className="flex items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-display text-base font-bold tracking-tight">{g.name}</span>
                    <span className="truncate text-xs text-muted">
                      {[g.category, g.platforms.join(", ")].filter(Boolean).join(" · ") || "No category yet"}
                    </span>
                    <span className="font-mono text-[11px] text-muted-strong">
                      {modeCount} mode{modeCount === 1 ? "" : "s"} · {formatCount} format{formatCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
