"use client";

/**
 * Circuit — the player/team rules editor for one GameFormat. Used for a
 * named format and for a formatless mode's single configuration alike.
 * Controlled: the parent owns `value` and sends it to the API as-is, and
 * the server re-validates with the same parseFormatInput.
 */

import type { CompetitionStyle, EntryType } from "@prisma/client";
import { structuresForStyle } from "@/lib/competitionStructures";
import { describeEntry, describeMatch, entriesPerMatch } from "@/lib/gameCatalog";
import { describePoints, effectiveTable, parseKillPoints, parsePlacementPoints, STANDARD_PLACEMENT_POINTS } from "@/lib/lobbyScoring";

export type FormatDraft = {
  name: string;
  description: string;
  entryType: EntryType;
  playersPerTeam: string;
  minRoster: string;
  maxRoster: string;
  teamsPerMatch: string;
  maxPlayersPerMatch: string;
  structures: string[];
  defaultRules: string;
  /** LOBBY formats: "10, 6, 5, …" (blank = standard) and points per kill. */
  placementPoints: string;
  killPoints: string;
};

/** Pre-ticks the structures that already run; if none do yet for this
 *  style (lobby scoring before its engine lands), all of the style's
 *  structures — a format must allow at least one to save. */
function defaultStructures(style: CompetitionStyle): string[] {
  const all = structuresForStyle(style);
  const runnable = all.filter((s) => s.runnable);
  return (runnable.length ? runnable : all).map((s) => s.id);
}

export function emptyFormatDraft(style: CompetitionStyle): FormatDraft {
  return {
    name: "",
    description: "",
    entryType: "INDIVIDUAL",
    playersPerTeam: "2",
    minRoster: "",
    maxRoster: "",
    teamsPerMatch: "",
    maxPlayersPerMatch: style === "LOBBY" ? "100" : "",
    structures: defaultStructures(style),
    defaultRules: "",
    placementPoints: "",
    killPoints: "1",
  };
}

type FormatLike = {
  name: string;
  description: string | null;
  entryType: EntryType;
  playersPerTeam: number;
  minRoster: number | null;
  maxRoster: number | null;
  teamsPerMatch: number | null;
  maxPlayersPerMatch: number | null;
  structures: string[];
  defaultRules: string | null;
  placementPoints?: number[];
  killPoints?: number;
};

export function draftFromFormat(f: FormatLike): FormatDraft {
  const s = (n: number | null) => (n === null ? "" : String(n));
  return {
    name: f.name,
    description: f.description ?? "",
    entryType: f.entryType,
    playersPerTeam: String(f.entryType === "TEAM" ? f.playersPerTeam : 2),
    minRoster: s(f.minRoster),
    maxRoster: s(f.maxRoster),
    teamsPerMatch: s(f.teamsPerMatch === 2 ? null : f.teamsPerMatch),
    maxPlayersPerMatch: s(f.maxPlayersPerMatch),
    structures: f.structures,
    defaultRules: f.defaultRules ?? "",
    placementPoints: (f.placementPoints ?? []).join(", "),
    killPoints: String(f.killPoints ?? 1),
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** The request body for this draft — blank numbers go as null. */
export function formatDraftBody(d: FormatDraft) {
  return {
    name: d.name,
    description: d.description,
    entryType: d.entryType,
    playersPerTeam: num(d.playersPerTeam),
    minRoster: num(d.minRoster),
    maxRoster: num(d.maxRoster),
    teamsPerMatch: num(d.teamsPerMatch),
    maxPlayersPerMatch: num(d.maxPlayersPerMatch),
    structures: d.structures,
    defaultRules: d.defaultRules,
    placementPoints: d.placementPoints,
    killPoints: d.killPoints,
  };
}

function preview(d: FormatDraft, style: CompetitionStyle) {
  const ppt = d.entryType === "TEAM" ? Number(d.playersPerTeam) || 2 : 1;
  const shape = {
    entryType: d.entryType,
    playersPerTeam: ppt,
    minRoster: num(d.minRoster),
    maxRoster: num(d.maxRoster),
    teamsPerMatch: style === "HEAD_TO_HEAD" ? 2 : num(d.teamsPerMatch),
    maxPlayersPerMatch: style === "HEAD_TO_HEAD" ? null : num(d.maxPlayersPerMatch),
  };
  return { entry: describeEntry(shape), match: describeMatch(shape, style), perLobby: entriesPerMatch(shape) };
}

export function FormatFields({
  value,
  onChange,
  style,
  hideName = false,
  idPrefix,
}: {
  value: FormatDraft;
  onChange: (next: FormatDraft) => void;
  style: CompetitionStyle;
  /** A formatless mode's configuration takes the mode's own name. */
  hideName?: boolean;
  idPrefix: string;
}) {
  const set = <K extends keyof FormatDraft>(key: K, v: FormatDraft[K]) => onChange({ ...value, [key]: v });
  const isTeam = value.entryType === "TEAM";
  const p = preview(value, style);
  const structures = structuresForStyle(style);

  return (
    <div className="flex flex-col gap-4">
      {!hideName && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Format name</span>
            <input required value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Squad" className="field-input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Description <span className="text-muted">(optional)</span></span>
            <input value={value.description} onChange={(e) => set("description", e.target.value)} placeholder="Shown to organizers" className="field-input" />
          </label>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="field-label mb-1.5">Entries are</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["INDIVIDUAL", "TEAM"] as const).map((type) => (
            <label
              key={type}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-[10px] border p-3 transition ${
                value.entryType === type ? "border-foreground bg-surface-elevated" : "border-border hover:border-border-hover"
              }`}
            >
              <input type="radio" name={`${idPrefix}-entry`} className="sr-only" checked={value.entryType === type} onChange={() => set("entryType", type)} />
              <span className="text-sm font-semibold">{type === "INDIVIDUAL" ? "Individual" : "Teams"}</span>
              <span className="text-xs text-muted">{type === "INDIVIDUAL" ? "Each player enters alone" : "Captains enter a roster"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {isTeam && (
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Players per team</span>
            <input type="number" min={2} max={50} required value={value.playersPerTeam} onChange={(e) => set("playersPerTeam", e.target.value)} className="field-input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Min roster</span>
            <input type="number" min={1} value={value.minRoster} onChange={(e) => set("minRoster", e.target.value)} placeholder={value.playersPerTeam} className="field-input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Max roster</span>
            <input type="number" min={1} value={value.maxRoster} onChange={(e) => set("maxRoster", e.target.value)} placeholder={value.playersPerTeam} className="field-input" />
          </label>
          <p className="field-hint col-span-3 -mt-1">Leave the roster limits blank for exactly {value.playersPerTeam || "N"} players. A higher max allows substitutes.</p>
        </div>
      )}

      {style === "LOBBY" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="field-label">Players per lobby</span>
            <input type="number" min={2} max={1000} required value={value.maxPlayersPerMatch} onChange={(e) => set("maxPlayersPerMatch", e.target.value)} className="field-input" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="field-label">{isTeam ? "Teams" : "Entries"} per lobby</span>
            <input type="number" min={2} value={value.teamsPerMatch} onChange={(e) => set("teamsPerMatch", e.target.value)} placeholder={p.perLobby ? `Up to ${p.perLobby}` : "Multiple"} className="field-input" />
          </label>
        </div>
      )}

      {style === "LOBBY" && <PointsFields value={value} set={set} idPrefix={idPrefix} />}

      <fieldset className="flex flex-col gap-2">
        <legend className="field-label mb-1.5">Organizers can run it as</legend>
        <div className="flex flex-wrap gap-2">
          {structures.map((s) => {
            const on = value.structures.includes(s.id);
            return (
              <label
                key={s.id}
                title={s.description}
                className={`flex cursor-pointer items-center gap-2 rounded-[9px] border px-3 py-2 text-[13px] transition ${
                  on ? "border-foreground bg-surface-elevated font-semibold" : "border-border text-muted hover:border-border-hover"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--foreground)]"
                  checked={on}
                  onChange={() => set("structures", on ? value.structures.filter((x) => x !== s.id) : [...value.structures, s.id])}
                />
                {s.label}
                {!s.runnable && <span className="font-mono text-[9px] font-bold tracking-[0.12em] text-muted-strong uppercase">Soon</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="field-label">Default rules <span className="text-muted">(optional)</span></span>
        <textarea rows={3} value={value.defaultRules} onChange={(e) => set("defaultRules", e.target.value)} placeholder="Offered to organizers as a starting point" className="field-textarea" />
      </label>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-surface-elevated px-3 py-2.5 text-xs">
        <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">Players see</span>
        <span className="font-semibold">{p.entry}</span>
        <span className="text-muted">{p.match}</span>
      </div>
    </div>
  );
}

function PointsFields({
  value,
  set,
  idPrefix,
}: {
  value: FormatDraft;
  set: <K extends keyof FormatDraft>(key: K, v: FormatDraft[K]) => void;
  idPrefix: string;
}) {
  const placement = parsePlacementPoints(value.placementPoints);
  const kill = parseKillPoints(value.killPoints);
  const summary = placement.ok && kill.ok ? describePoints(effectiveTable({ placementPoints: placement.value, killPoints: kill.value })) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <label className="flex flex-col gap-1.5" htmlFor={`${idPrefix}-placement-points`}>
          <span className="field-label">Placement points</span>
          <input
            id={`${idPrefix}-placement-points`}
            value={value.placementPoints}
            onChange={(e) => set("placementPoints", e.target.value)}
            placeholder={STANDARD_PLACEMENT_POINTS.join(", ")}
            className="field-input font-mono text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor={`${idPrefix}-kill-points`}>
          <span className="field-label">Per kill</span>
          <input
            id={`${idPrefix}-kill-points`}
            type="number"
            min={0}
            max={100}
            value={value.killPoints}
            onChange={(e) => set("killPoints", e.target.value)}
            className="field-input"
          />
        </label>
      </div>
      <p className={`field-hint ${summary ? "" : "text-danger"}`}>
        {summary
          ? `Points for 1st, 2nd, 3rd… — places past the list score 0. Blank uses the standard table. Scores: ${summary}.`
          : !placement.ok
            ? placement.error
            : !kill.ok
              ? kill.error
              : ""}
      </p>
    </div>
  );
}
