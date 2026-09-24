"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { GameForm } from "./GameForm";

type Game = {
  id: string;
  name: string;
  iconUrl: string | null;
  enabled: boolean;
};

export function GameRow({ game }: { game: Game }) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleEnabled() {
    setBusy(true);
    await fetch(`/api/admin/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !game.enabled }),
    });
    setBusy(false);
    router.refresh();
  }

  async function handleDelete() {
    const confirmed = await confirmDialog({
      title: `Delete "${game.name}"?`,
      message: "Existing tournaments/challenges keep their game name — this only removes it from the creation form's options.",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;
    setBusy(true);
    await fetch(`/api/admin/games/${game.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[6px] border border-border bg-surface-elevated">
          {game.iconUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-pasted icon URL
            <img src={game.iconUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{game.name}</span>

        <span className={`badge ${game.enabled ? "badge-open" : "badge-neutral"}`}>{game.enabled ? "Enabled" : "Disabled"}</span>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" disabled={busy} onClick={toggleEnabled} className="btn-ghost px-3 py-1.5 text-xs">
            {game.enabled ? "Disable" : "Enable"}
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="btn-secondary px-3 py-1.5 text-xs">
            {editing ? "Close" : "Edit"}
          </button>
          <button type="button" disabled={busy} onClick={handleDelete} aria-label="Delete" className="text-danger hover:opacity-70">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {editing && <GameForm game={game} onDone={() => setEditing(false)} />}
    </div>
  );
}
