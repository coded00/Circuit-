/**
 * Circuit — Admin Games. Real `Game` catalog rows: what the tournament/
 * challenge creation and edit forms offer as game options (see that
 * model's schema comment). Not a foreign key onto Tournament.game/
 * Battle.game, so disabling or deleting a game here only changes future
 * form options, not anything already created.
 */

import { prisma } from "@/lib/db";
import { GameList } from "@/components/admin/GameList";

export default async function AdminGamesPage() {
  const games = await prisma.game.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Games</h1>
        <p className="text-sm text-muted">
          The catalog organizers pick from when creating a tournament or challenge. Disabling a game removes it from
          those forms without touching anything already created.
        </p>
      </div>

      <div className="card flex flex-col gap-1">
        <GameList games={games} />
      </div>
    </div>
  );
}
