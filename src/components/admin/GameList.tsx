"use client";

import { useState } from "react";
import { GameRow } from "./GameRow";
import { GameForm } from "./GameForm";

type Game = {
  id: string;
  name: string;
  iconUrl: string | null;
  enabled: boolean;
};

export function GameList({ games }: { games: Game[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      {games.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">No games yet.</p>
      ) : (
        games.map((g) => <GameRow key={g.id} game={g} />)
      )}

      {creating ? (
        <GameForm onDone={() => setCreating(false)} />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="btn-secondary mt-2 w-fit text-sm">
          + Add game
        </button>
      )}
    </div>
  );
}
