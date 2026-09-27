"use client";

/**
 * Circuit — Game → Mode → Format → Structure, as configured in the game
 * catalog (Admin → Games). Used by the tournament create and edit forms.
 * Structures without an engine yet stay visible but locked, labelled
 * "coming soon" — see src/lib/competitionRules.ts for the rules.
 */

import { DEFAULT_LOBBY_ROUNDS, MAX_LOBBY_ROUNDS } from "@/lib/lobbyScoring";
import { UNAVAILABLE_LABEL, type PickerFormat, type PickerGame, type PickerMode } from "@/lib/competitionRules";

/** lobbyRounds only matters for lobby modes (a number as typed). */
export type CompetitionValue = { gameId: string; gameModeId: string; gameFormatId: string; structure: string; lobbyRounds: string };

export const DEFAULT_ROUNDS = String(DEFAULT_LOBBY_ROUNDS);

function firstAvailableFormat(mode: PickerMode): PickerFormat | undefined {
  return mode.formats.find((f) => !f.unavailable);
}

function firstRunnable(format: PickerFormat | undefined): string {
  return format?.structures.find((s) => s.runnable)?.id ?? "";
}

/** The first pickable combination in a game (or the whole catalog). */
export function defaultCompetition(catalog: PickerGame[], gameId?: string): CompetitionValue {
  const games = gameId ? catalog.filter((g) => g.id === gameId) : catalog;
  for (const game of [...games.filter((g) => g.available), ...games]) {
    const mode = game.modes.find((m) => !m.unavailable) ?? game.modes[0];
    const format = mode ? (firstAvailableFormat(mode) ?? mode.formats[0]) : undefined;
    return { gameId: game.id, gameModeId: mode?.id ?? "", gameFormatId: format?.id ?? "", structure: firstRunnable(format), lobbyRounds: DEFAULT_ROUNDS };
  }
  return { gameId: "", gameModeId: "", gameFormatId: "", structure: "", lobbyRounds: DEFAULT_ROUNDS };
}

/** Looks up the objects behind a value. */
export function selectedParts(catalog: PickerGame[], value: CompetitionValue) {
  const game = catalog.find((g) => g.id === value.gameId);
  const mode = game?.modes.find((m) => m.id === value.gameModeId);
  const format = mode?.formats.find((f) => f.id === value.gameFormatId);
  return { game, mode, format };
}

const chip = (on: boolean, locked: boolean) =>
  `flex min-h-10 items-center gap-2 rounded-[10px] border px-3.5 py-2 text-left text-sm transition ${
    locked
      ? "cursor-not-allowed border-dashed border-border text-muted-strong"
      : on
        ? "border-foreground bg-foreground font-semibold text-background"
        : "border-border bg-surface font-medium hover:border-border-hover"
  }`;

export function CompetitionPicker({
  catalog,
  value,
  onChange,
  locked = false,
  lockedReason,
}: {
  catalog: PickerGame[];
  value: CompetitionValue;
  onChange: (next: CompetitionValue) => void;
  /** Editing after people registered: shown, not changeable. */
  locked?: boolean;
  lockedReason?: string;
}) {
  const { game, mode, format } = selectedParts(catalog, value);

  function pickGame(gameId: string) {
    onChange({ ...defaultCompetition(catalog, gameId), lobbyRounds: value.lobbyRounds });
  }
  function pickMode(next: PickerMode) {
    const f = firstAvailableFormat(next) ?? next.formats[0];
    onChange({ ...value, gameModeId: next.id, gameFormatId: f?.id ?? "", structure: firstRunnable(f) });
  }
  function pickFormat(next: PickerFormat) {
    onChange({ ...value, gameFormatId: next.id, structure: firstRunnable(next) });
  }

  if (catalog.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-border px-4 py-3 text-sm text-muted">
        No games are published yet — an admin needs to publish one in Admin → Games before tournaments can be created.
      </p>
    );
  }

  return (
    <fieldset disabled={locked} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="game" className="field-label">
          Game
        </label>
        <select id="game" value={value.gameId} onChange={(e) => pickGame(e.target.value)} className="field-select">
          {catalog.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
              {g.available ? "" : " — coming soon"}
            </option>
          ))}
        </select>
        {locked && lockedReason && <span className="field-hint">{lockedReason}</span>}
      </div>

      {game && (
        <div className="flex flex-col gap-1.5">
          <span className="field-label">Game mode</span>
          {game.modes.length === 0 ? (
            <p className="text-sm text-muted">This game has no active modes yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Game mode">
              {game.modes.map((m) => {
                const on = m.id === value.gameModeId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!!m.unavailable}
                    onClick={() => pickMode(m)}
                    className={`${chip(on, !!m.unavailable)} flex-col !items-start`}
                  >
                    <span>{m.name}</span>
                    <span className={`text-xs font-normal ${on ? "opacity-80" : "text-muted"}`}>
                      {m.unavailable ? UNAVAILABLE_LABEL[m.unavailable] : m.style === "LOBBY" ? "Lobby" : "Head-to-head"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {mode?.usesFormats && (
        <div className="flex flex-col gap-1.5">
          <span className="field-label">Format</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Format">
            {mode.formats.map((f) => {
              const on = f.id === value.gameFormatId;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!!f.unavailable}
                  onClick={() => pickFormat(f)}
                  title={f.unavailable ? UNAVAILABLE_LABEL[f.unavailable] : undefined}
                  className={chip(on, !!f.unavailable)}
                >
                  {f.name}
                  {f.unavailable && <span className="text-[11px]">· soon</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {format && (
        <div className="flex flex-col gap-1.5">
          <span className="field-label">How it&apos;s run</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Competition structure">
            {format.structures.map((s) => {
              const on = s.id === value.structure;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!s.runnable || !!format.unavailable}
                  onClick={() => onChange({ ...value, structure: s.id })}
                  title={s.description}
                  className={chip(on, !s.runnable || !!format.unavailable)}
                >
                  {s.label}
                  {!s.runnable && <span className="text-[11px]">· soon</span>}
                </button>
              );
            })}
          </div>
          <span className="field-hint">
            {format.entry} · {format.match}
            {format.unavailable ? ` — ${UNAVAILABLE_LABEL[format.unavailable].toLowerCase()}` : ""}
          </span>
        </div>
      )}

      {format && mode?.style === "LOBBY" && (
        <div className="grid grid-cols-1 gap-3 rounded-[12px] border border-border bg-surface-elevated/40 p-3.5 sm:grid-cols-[8rem_1fr]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lobbyRounds" className="field-label">
              Rounds
            </label>
            <input
              id="lobbyRounds"
              type="number"
              min={1}
              max={MAX_LOBBY_ROUNDS}
              required
              value={value.lobbyRounds}
              onChange={(e) => onChange({ ...value, lobbyRounds: e.target.value })}
              className="field-input"
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className="field-label">Scoring</span>
            <span className="text-muted">{format.points}</span>
            <span className="text-xs text-muted">
              Everyone plays every round in one lobby{format.lobbyCapacity ? ` (up to ${format.lobbyCapacity} entries)` : ""}. You enter placements and kills after each round; the points table is set for this format.
            </span>
          </div>
        </div>
      )}
    </fieldset>
  );
}
