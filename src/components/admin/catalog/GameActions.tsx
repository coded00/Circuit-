"use client";

/**
 * Circuit — publish / activate / delete controls for one game, shown in
 * the builder header. Publishing is refused server-side until the game
 * has an active mode with an active format (see publishBlocker).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { Switch, catalogRequest } from "./shared";

export function GameActions({
  game,
  blocker,
}: {
  game: { id: string; name: string; enabled: boolean; published: boolean };
  blocker: string | null;
}) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    const err = await catalogRequest(method, `/api/admin/games/${game.id}`, body);
    setBusy(false);
    if (err) return setError(err);
    // replace: the page they were on no longer exists.
    if (method === "DELETE") router.replace("/admin/games");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Active
          <Switch checked={game.enabled} disabled={busy} label="Game active" onChange={(enabled) => run("PATCH", { enabled })} />
        </label>
        {game.published ? (
          <button type="button" disabled={busy} onClick={() => run("PATCH", { published: false })} className="btn-secondary px-4 py-2 text-sm">
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !!blocker}
            title={blocker ?? undefined}
            onClick={() => run("PATCH", { published: true })}
            className="btn-primary px-4 py-2 text-sm"
          >
            Publish game
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          className="btn-danger px-4 py-2 text-sm"
          onClick={async () => {
            const ok = await confirmDialog({
              title: `Delete ${game.name}?`,
              message: "Its modes and formats are deleted too. Existing competitions keep their game name.",
              confirmLabel: "Delete game",
            });
            if (ok) run("DELETE");
          }}
        >
          Delete
        </button>
      </div>
      {!game.published && blocker && <p className="text-xs text-muted">{blocker}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
