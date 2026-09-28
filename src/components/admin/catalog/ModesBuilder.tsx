"use client";

/**
 * Circuit — the Game Modes half of the admin game builder: every mode as
 * a card with its formats nested under it, each reorderable, editable,
 * toggleable and deletable in place. All writes go through the catalog
 * API and then refresh the server-rendered tree.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { describeEntry, describeMatch, describeStructures, type CatalogFormat, type CatalogMode } from "@/lib/gameCatalog";
import { FormatForm } from "./FormatForm";
import { ModeForm } from "./ModeForm";
import { ReorderButtons, StatusBadge, Switch, catalogRequest } from "./shared";

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
}

/**
 * Shows a reorder immediately instead of waiting for the server refresh.
 * The pending order is kept only while it still describes the same set
 * of items and differs from what the server sent; once fresh props
 * arrive in that order (or items are added/removed) the props win again.
 */
function useOptimisticOrder<T extends { id: string }>(items: T[]) {
  const [pending, setPending] = useState<string[] | null>(null);
  const serverIds = items.map((i) => i.id).join(",");
  const valid = pending && pending.length === items.length && pending.join(",") !== serverIds && pending.every((id) => items.some((i) => i.id === id));
  const ordered = valid ? pending.map((id) => items.find((i) => i.id === id)!) : items;
  return [ordered, (next: T[]) => setPending(next.map((i) => i.id))] as const;
}

function FormatRow({
  format,
  mode,
  index,
  count,
  onReorder,
  busy,
  run,
}: {
  format: CatalogFormat;
  mode: CatalogMode;
  index: number;
  count: number;
  onReorder: (delta: number) => void;
  busy: boolean;
  run: (fn: () => Promise<string | null>) => Promise<string | null>;
}) {
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  if (editing) {
    return (
      <li>
        <FormatForm
          modeId={mode.id}
          style={mode.style}
          format={format}
          onDone={(changed) => {
            setEditing(false);
            if (changed) router.refresh();
          }}
        />
      </li>
    );
  }

  return (
    <li className={`flex items-center gap-3 rounded-[10px] border border-border bg-background/40 py-2 pr-2 pl-1.5 ${format.enabled ? "" : "opacity-60"}`}>
      <ReorderButtons label={format.name} onUp={() => onReorder(-1)} onDown={() => onReorder(1)} disableUp={index === 0 || busy} disableDown={index === count - 1 || busy} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{format.name}</span>
        <span className="text-xs leading-snug text-muted">
          <span className="font-mono text-[11px] text-foreground/80">{describeMatch(format, mode.style)}</span>
          {" · "}
          {describeEntry(format)}
        </span>
        <span className="truncate text-[11px] text-muted-strong">{describeStructures(format.structures)}</span>
      </span>
      <Switch
        checked={format.enabled}
        disabled={busy}
        label={`${format.name} active`}
        onChange={(enabled) => run(() => catalogRequest("PATCH", `/api/admin/game-formats/${format.id}`, { enabled }))}
      />
      <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${format.name}`} className="btn-icon h-8 w-8">
        <Pencil size={14} />
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={`Delete ${format.name}`}
        className="btn-icon h-8 w-8 hover:text-danger"
        onClick={async () => {
          if (!(await confirmDialog({ title: `Delete the ${format.name} format?`, message: "Organizers won't be able to pick it any more.", confirmLabel: "Delete format" }))) return;
          await run(() => catalogRequest("DELETE", `/api/admin/game-formats/${format.id}`));
        }}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function ModeCard({
  gameId,
  mode,
  index,
  count,
  onReorder,
  busy,
  run,
}: {
  gameId: string;
  mode: CatalogMode;
  index: number;
  count: number;
  onReorder: (delta: number) => void;
  busy: boolean;
  run: (fn: () => Promise<string | null>) => Promise<string | null>;
}) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const single = !mode.usesFormats ? mode.formats[0] : null;
  const [formats, setFormatOrder] = useOptimisticOrder(mode.formats);

  if (editing) {
    return (
      <ModeForm
        gameId={gameId}
        mode={mode}
        onDone={(changed) => {
          setEditing(false);
          if (changed) router.refresh();
        }}
      />
    );
  }

  return (
    <section className={`flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-3 sm:p-4 ${mode.enabled ? "" : "opacity-70"}`}>
      <header className="flex items-center gap-3">
        <ReorderButtons label={mode.name} onUp={() => onReorder(-1)} onDown={() => onReorder(1)} disableUp={index === 0 || busy} disableDown={index === count - 1 || busy} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{mode.name}</span>
            <span className="badge badge-neutral">{mode.style === "LOBBY" ? "Lobby" : "Head-to-head"}</span>
            {!mode.enabled && <StatusBadge enabled={false} />}
          </span>
          {mode.description && <span className="truncate text-xs text-muted">{mode.description}</span>}
        </span>
        <Switch checked={mode.enabled} disabled={busy} label={`${mode.name} active`} onChange={(enabled) => run(() => catalogRequest("PATCH", `/api/admin/game-modes/${mode.id}`, { enabled }))} />
        <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${mode.name}`} className="btn-icon h-9 w-9">
          <Pencil size={15} />
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label={`Delete ${mode.name}`}
          className="btn-icon h-9 w-9 hover:text-danger"
          onClick={async () => {
            if (!(await confirmDialog({ title: `Delete ${mode.name}?`, message: "Its formats are deleted with it. Existing competitions keep their details.", confirmLabel: "Delete mode" }))) return;
            await run(() => catalogRequest("DELETE", `/api/admin/game-modes/${mode.id}`));
          }}
        >
          <Trash2 size={15} />
        </button>
      </header>

      <div className="flex flex-col gap-2 sm:pl-8">
        {single ? (
          <p className="rounded-[10px] bg-surface-elevated/60 px-3 py-2 text-xs">
            <span className="font-semibold">{describeMatch(single, mode.style)}</span>
            <span className="text-muted"> · {describeEntry(single)} · {describeStructures(single.structures)}</span>
          </p>
        ) : (
          <>
            <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
              Formats · {mode.formats.length}
            </span>
            {mode.formats.length === 0 && !adding && (
              <p className="text-xs text-muted">No formats yet — organizers can&apos;t pick this mode until it has one.</p>
            )}
            {mode.formats.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {formats.map((f, i) => (
                  <FormatRow
                    key={f.id}
                    format={f}
                    mode={mode}
                    index={i}
                    count={mode.formats.length}
                    busy={busy}
                    run={run}
                    onReorder={(delta) => {
                      const next = move(formats, i, delta);
                      setFormatOrder(next);
                      run(() => catalogRequest("POST", `/api/admin/game-modes/${mode.id}/formats/reorder`, { ids: next.map((x) => x.id) })).then(
                        (err) => err && setFormatOrder(mode.formats)
                      );
                    }}
                  />
                ))}
              </ul>
            )}
            {adding ? (
              <FormatForm
                modeId={mode.id}
                style={mode.style}
                onDone={(changed) => {
                  setAdding(false);
                  if (changed) router.refresh();
                }}
              />
            ) : (
              <button type="button" onClick={() => setAdding(true)} className="flex w-fit items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-semibold text-muted transition hover:bg-surface-elevated hover:text-foreground">
                <Plus size={13} /> Add format
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function ModesBuilder({ gameId, modes: serverModes }: { gameId: string; modes: CatalogMode[] }) {
  const router = useRouter();
  const [modes, setModeOrder] = useOptimisticOrder(serverModes);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    router.refresh();
    return err;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="field-error">{error}</p>}
      {modes.length === 0 && !adding && (
        <div className="rounded-[14px] border border-dashed border-border-strong px-6 py-10 text-center">
          <p className="text-sm font-semibold">No modes yet</p>
          <p className="mt-1 text-xs text-muted">Add the ways this game is played competitively — each with its own formats and team rules.</p>
        </div>
      )}
      {modes.map((m, i) => (
        <ModeCard
          key={m.id}
          gameId={gameId}
          mode={m}
          index={i}
          count={modes.length}
          busy={busy}
          run={run}
          onReorder={(delta) => {
            const next = move(modes, i, delta);
            setModeOrder(next);
            run(() => catalogRequest("POST", `/api/admin/games/${gameId}/modes/reorder`, { ids: next.map((x) => x.id) })).then(
              (err) => err && setModeOrder(serverModes)
            );
          }}
        />
      ))}
      {adding ? (
        <ModeForm
          gameId={gameId}
          onDone={(changed) => {
            setAdding(false);
            if (changed) router.refresh();
          }}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-secondary w-full border-dashed">
          <Plus size={15} /> Add game mode
        </button>
      )}
    </div>
  );
}
