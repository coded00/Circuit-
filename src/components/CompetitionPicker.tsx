"use client";

/**
 * Circuit — Game → Mode → Format → Structure, as configured in the game
 * catalog (Admin → Games). Used by the tournament create and edit forms.
 * Structures without an engine yet stay visible but locked, labelled
 * "coming soon" — see src/lib/competitionRules.ts for the rules.
 */

import { DEFAULT_LOBBY_ROUNDS, MAX_LOBBY_GROUPS, MAX_LOBBY_ROUNDS } from "@/lib/lobbyScoring";
import { InfoTip } from "@/components/InfoTip";
import { UNAVAILABLE_LABEL, type PickerFormat, type PickerGame, type PickerMode } from "@/lib/competitionRules";

/** Lobby settings only matter for lobby modes (numbers as typed; lobbyGroups "" = one lobby). */
export type CompetitionValue = {
  gameId: string;
  gameModeId: string;
  gameFormatId: string;
  structure: string;
  lobbyRounds: string;
  lobbyGroups: string;
  lobbyQualifiers: string;
  lobbyFinalRounds: string;
  /** League settings (numbers as typed) — only used when the structure is a league. */
  leagueWinPoints: string;
  leagueAllowDraws: boolean;
  leagueDrawPoints: string;
  leagueLegs: string;
  leagueMatchdayDays: string;
};

export const LEAGUE_FORM_DEFAULTS = { leagueWinPoints: "3", leagueAllowDraws: true, leagueDrawPoints: "1", leagueLegs: "1", leagueMatchdayDays: "7" };

const NO_GROUPS = { lobbyGroups: "", lobbyQualifiers: "", lobbyFinalRounds: "" };

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
    return { gameId: game.id, gameModeId: mode?.id ?? "", gameFormatId: format?.id ?? "", structure: firstRunnable(format), lobbyRounds: DEFAULT_ROUNDS, ...NO_GROUPS, ...LEAGUE_FORM_DEFAULTS };
  }
  return { gameId: "", gameModeId: "", gameFormatId: "", structure: "", lobbyRounds: DEFAULT_ROUNDS, ...NO_GROUPS, ...LEAGUE_FORM_DEFAULTS };
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
  const groupsHint = (() => {
    const g = Number(value.lobbyGroups);
    const q = Number(value.lobbyQualifiers);
    const cap = format?.lobbyCapacity ?? null;
    if (!g) return { text: "", error: false };
    if (cap && g * q > cap) return { text: `${g} × ${q} = ${g * q} finalists — one lobby holds ${cap}.`, error: true };
    return { text: `${g * q} finalists${cap ? ` of ${cap} lobby places` : ""}. Up to ${cap ? g * cap : "—"} entries across the groups.`, error: false };
  })();

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

      {format && value.structure === "LEAGUE" && (
        <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-surface-elevated/40 p-3.5">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            League settings
            <InfoTip text="In a league everyone plays everyone and earns points for each result. The most points when every match is played wins. These can't be changed once players register." />
          </span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Points for a win</span>
              <input
                id="leagueWinPoints"
                type="number"
                min={1}
                max={10}
                required
                value={value.leagueWinPoints}
                onChange={(e) => onChange({ ...value, leagueWinPoints: e.target.value })}
                className="field-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Points for a draw</span>
              <input
                id="leagueDrawPoints"
                type="number"
                min={0}
                max={9}
                required={value.leagueAllowDraws}
                disabled={!value.leagueAllowDraws}
                value={value.leagueAllowDraws ? value.leagueDrawPoints : ""}
                onChange={(e) => onChange({ ...value, leagueDrawPoints: e.target.value })}
                className="field-input disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Each pair plays</span>
              <select id="leagueLegs" value={value.leagueLegs} onChange={(e) => onChange({ ...value, leagueLegs: e.target.value })} className="field-input">
                <option value="1">Once</option>
                <option value="2">Twice (home and away)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="field-label">Days per matchday</span>
              <input
                id="leagueMatchdayDays"
                type="number"
                min={1}
                max={30}
                required
                value={value.leagueMatchdayDays}
                onChange={(e) => onChange({ ...value, leagueMatchdayDays: e.target.value })}
                className="field-input"
              />
            </label>
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={value.leagueAllowDraws}
              onChange={(e) => onChange({ ...value, leagueAllowDraws: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-volt)]"
            />
            <span className="flex flex-col">
              <span className="font-medium">Allow draws</span>
              <span className="text-xs text-muted">Turn this off for games that can&apos;t end level — every match then has a winner.</span>
            </span>
          </label>
          <span className="field-hint">
            Fixtures are drawn when registration closes and grouped into matchdays. Each matchday has a play-by date {value.leagueMatchdayDays || "7"} days after the last; fixtures nobody plays by
            then are flagged for you to settle. Up to 16 entries.
          </span>
        </div>
      )}

      {format && mode?.style === "LOBBY" && (
        <div className="grid grid-cols-1 gap-3 rounded-[12px] border border-border bg-surface-elevated/40 p-3.5 sm:grid-cols-[8rem_1fr]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lobbyRounds" className="field-label">
              {value.lobbyGroups ? "Group rounds" : "Rounds"}
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
              {value.lobbyGroups
                ? `Entries are split into ${value.lobbyGroups} group lobbies that each play the group rounds; the top ${value.lobbyQualifiers || "N"} of each group play the final, where points start fresh.`
                : `Everyone plays every round in one lobby${format.lobbyCapacity ? ` (up to ${format.lobbyCapacity} entries)` : ""}.`}{" "}
              You enter placements and kills after each round; the points table is set for this format.
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={!!value.lobbyGroups}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? { ...value, lobbyGroups: "2", lobbyQualifiers: String(Math.max(1, Math.floor((format.lobbyCapacity ?? 20) / 2))), lobbyFinalRounds: DEFAULT_ROUNDS }
                    : { ...value, ...NO_GROUPS }
                )
              }
              className="accent-[var(--accent-volt)]"
            />
            <span className="font-medium">Groups, then a final</span>
            <span className="text-xs text-muted">— for more entries than one lobby holds</span>
          </label>
          {value.lobbyGroups && (
            <div className="grid grid-cols-3 gap-3 sm:col-span-2">
              <label className="flex flex-col gap-1.5">
                <span className="field-label">Groups</span>
                <input
                  id="lobbyGroups"
                  type="number"
                  min={2}
                  max={MAX_LOBBY_GROUPS}
                  required
                  value={value.lobbyGroups}
                  onChange={(e) => onChange({ ...value, lobbyGroups: e.target.value })}
                  className="field-input"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="field-label">Qualify per group</span>
                <input
                  id="lobbyQualifiers"
                  type="number"
                  min={1}
                  required
                  value={value.lobbyQualifiers}
                  onChange={(e) => onChange({ ...value, lobbyQualifiers: e.target.value })}
                  className="field-input"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="field-label">Final rounds</span>
                <input
                  id="lobbyFinalRounds"
                  type="number"
                  min={1}
                  max={MAX_LOBBY_ROUNDS}
                  required
                  value={value.lobbyFinalRounds}
                  onChange={(e) => onChange({ ...value, lobbyFinalRounds: e.target.value })}
                  className="field-input"
                />
              </label>
              <span className={`field-hint col-span-3 ${groupsHint.error ? "text-danger" : ""}`}>{groupsHint.text}</span>
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}
