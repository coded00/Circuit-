/**
 * Circuit — the admin game builder: Game Information on one side, the
 * Game Modes → Formats tree on the other. Everything an organizer can
 * choose for this game, and every player/team rule a competition
 * inherits, is configured here.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { loadGameTree } from "@/lib/gameCatalogQueries";
import { publishBlocker } from "@/lib/gameCatalog";
import { GameInfoForm } from "@/components/admin/catalog/GameInfoForm";
import { ModesBuilder } from "@/components/admin/catalog/ModesBuilder";
import { GameActions } from "@/components/admin/catalog/GameActions";

export default async function AdminGameBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await loadGameTree(id);
  if (!game) notFound();

  const status = !game.enabled ? "Inactive" : game.publishedAt ? "Published" : "Draft";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/admin/games" className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← All games
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Game · {status}</span>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{game.name}</h1>
        </div>
        <GameActions game={{ id: game.id, name: game.name, enabled: game.enabled, published: !!game.publishedAt }} blocker={publishBlocker(game.modes)} />
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">Game information</h2>
          <div className="card">
            <GameInfoForm game={game} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
            Game modes · {game.modes.length}
          </h2>
          <ModesBuilder gameId={game.id} modes={game.modes} />
        </section>
      </div>
    </div>
  );
}
