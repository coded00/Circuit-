/**
 * Circuit — the game catalog's rules: validation for admin-entered
 * Game / GameMode / GameFormat data, and the plain-language summaries
 * every surface uses to describe a format. Pure functions only — shared
 * by the admin API routes and the builder UI so they can never disagree.
 *
 * Nothing here knows about any specific game. The only built-in rules
 * are the ones that follow from the contest style itself:
 * - a HEAD_TO_HEAD mode always has two sides per match;
 * - a LOBBY mode needs a lobby player cap;
 * - an individual format is one player per entry.
 */

import type { CompetitionStyle, EntryType } from "@prisma/client";
import { COMPETITION_STRUCTURES, getStructure } from "@/lib/competitionStructures";
import { parseKillPoints, parsePlacementPoints, STANDARD_KILL_POINTS } from "@/lib/lobbyScoring";

export const MAX_PLAYERS_PER_TEAM = 50;
export const MAX_LOBBY_PLAYERS = 1000;
const MAX_NAME = 60;
const MAX_TEXT = 5000;

export type CatalogFormat = {
  id: string;
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
  /** LOBBY formats: see src/lib/lobbyScoring.ts. [] = the standard table. */
  placementPoints: number[];
  killPoints: number;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
};

export type CatalogMode = {
  id: string;
  name: string;
  description: string | null;
  style: CompetitionStyle;
  usesFormats: boolean;
  enabled: boolean;
  sortOrder: number;
  formats: CatalogFormat[];
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function int(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) ? n : NaN;
}

// ---------------------------------------------------------------- Game

export type GameInput = {
  name: string;
  description: string | null;
  iconUrl: string | null;
  coverUrl: string | null;
  category: string | null;
  platforms: string[];
  publisher: string | null;
  slug: string | null;
  seoName: string | null;
  aliases: string[];
};

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseGameInput(body: Record<string, unknown>): Result<GameInput> {
  const name = str(body.name, MAX_NAME);
  if (!name) return { ok: false, error: "Game name is required." };
  const platforms = Array.isArray(body.platforms)
    ? Array.from(new Set(body.platforms.map((p) => str(p, 30)).filter((p): p is string => !!p))).slice(0, 12)
    : [];
  const slug = str(body.slug, 60)?.toLowerCase() ?? null;
  if (slug && !SLUG_PATTERN.test(slug)) return { ok: false, error: "The page address can only use lowercase letters, numbers and single dashes, like call-of-duty-mobile." };
  const aliasList = Array.isArray(body.aliases) ? body.aliases : typeof body.aliases === "string" ? body.aliases.split(",") : [];
  const aliases = Array.from(new Set(aliasList.map((a) => str(a, 40)).filter((a): a is string => !!a))).slice(0, 8);
  return {
    ok: true,
    value: {
      name,
      slug,
      seoName: str(body.seoName, 80),
      aliases,
      description: str(body.description, MAX_TEXT),
      iconUrl: str(body.iconUrl, 500),
      coverUrl: str(body.coverUrl, 500),
      category: str(body.category, 40),
      platforms,
      publisher: str(body.publisher, 80),
    },
  };
}

// ---------------------------------------------------------------- Mode

export type ModeInput = {
  name: string;
  description: string | null;
  style: CompetitionStyle;
  usesFormats: boolean;
};

export function parseModeInput(body: Record<string, unknown>): Result<ModeInput> {
  const name = str(body.name, MAX_NAME);
  if (!name) return { ok: false, error: "Mode name is required." };
  if (body.style !== "HEAD_TO_HEAD" && body.style !== "LOBBY") {
    return { ok: false, error: "Pick how this mode is contested." };
  }
  return {
    ok: true,
    value: { name, description: str(body.description, MAX_TEXT), style: body.style, usesFormats: body.usesFormats !== false },
  };
}

// -------------------------------------------------------------- Format

export type FormatInput = Omit<CatalogFormat, "id" | "isDefault" | "enabled" | "sortOrder">;

export function parseFormatInput(body: Record<string, unknown>, style: CompetitionStyle): Result<FormatInput> {
  const name = str(body.name, MAX_NAME);
  if (!name) return { ok: false, error: "Format name is required." };

  const entryType: EntryType = body.entryType === "TEAM" ? "TEAM" : "INDIVIDUAL";
  let playersPerTeam = entryType === "INDIVIDUAL" ? 1 : int(body.playersPerTeam);
  if (entryType === "TEAM") {
    if (playersPerTeam === null || Number.isNaN(playersPerTeam) || playersPerTeam < 2 || playersPerTeam > MAX_PLAYERS_PER_TEAM) {
      return { ok: false, error: `Team formats need 2–${MAX_PLAYERS_PER_TEAM} players per team.` };
    }
  }
  playersPerTeam = playersPerTeam as number;

  let minRoster: number | null = null;
  let maxRoster: number | null = null;
  if (entryType === "TEAM") {
    minRoster = int(body.minRoster);
    maxRoster = int(body.maxRoster);
    if (Number.isNaN(minRoster) || Number.isNaN(maxRoster)) return { ok: false, error: "Roster sizes must be whole numbers." };
    const min = minRoster ?? playersPerTeam;
    const max = maxRoster ?? playersPerTeam;
    if (min < 1 || min > playersPerTeam) {
      return { ok: false, error: `Minimum roster must be between 1 and ${playersPerTeam}.` };
    }
    if (max < playersPerTeam || max > MAX_PLAYERS_PER_TEAM) {
      return { ok: false, error: `Maximum roster must be between ${playersPerTeam} and ${MAX_PLAYERS_PER_TEAM}.` };
    }
    // Store null when it just equals the playing size — "exactly N".
    minRoster = min === playersPerTeam ? null : min;
    maxRoster = max === playersPerTeam ? null : max;
  }

  let teamsPerMatch: number | null;
  let maxPlayersPerMatch: number | null;
  if (style === "HEAD_TO_HEAD") {
    teamsPerMatch = 2;
    maxPlayersPerMatch = null;
  } else {
    teamsPerMatch = int(body.teamsPerMatch);
    maxPlayersPerMatch = int(body.maxPlayersPerMatch);
    if (Number.isNaN(teamsPerMatch) || Number.isNaN(maxPlayersPerMatch)) {
      return { ok: false, error: "Lobby sizes must be whole numbers." };
    }
    if (maxPlayersPerMatch === null || maxPlayersPerMatch < playersPerTeam * 2 || maxPlayersPerMatch > MAX_LOBBY_PLAYERS) {
      return { ok: false, error: `Set a lobby player cap of at least ${playersPerTeam * 2}.` };
    }
    if (teamsPerMatch !== null) {
      if (teamsPerMatch < 2) return { ok: false, error: "A lobby needs at least 2 entries." };
      if (teamsPerMatch * playersPerTeam > maxPlayersPerMatch) {
        return { ok: false, error: `${teamsPerMatch} entries of ${playersPerTeam} is more than the ${maxPlayersPerMatch}-player cap.` };
      }
    }
  }

  let placementPoints: number[] = [];
  let killPoints = STANDARD_KILL_POINTS;
  if (style === "LOBBY") {
    const placement = parsePlacementPoints(body.placementPoints);
    if (!placement.ok) return placement;
    const kill = parseKillPoints(body.killPoints);
    if (!kill.ok) return kill;
    placementPoints = placement.value;
    killPoints = kill.value;
  }

  const requested = Array.isArray(body.structures) ? body.structures.filter((s): s is string => typeof s === "string") : [];
  const structures = COMPETITION_STRUCTURES.filter((s) => s.style === style && requested.includes(s.id)).map((s) => s.id);
  if (structures.length === 0) return { ok: false, error: "Allow at least one competition structure." };

  return {
    ok: true,
    value: {
      name,
      description: str(body.description, MAX_TEXT),
      entryType,
      playersPerTeam,
      minRoster,
      maxRoster,
      teamsPerMatch,
      maxPlayersPerMatch,
      structures,
      defaultRules: str(body.defaultRules, MAX_TEXT),
      placementPoints,
      killPoints,
    },
  };
}

// ----------------------------------------------------------- Summaries

type FormatShape = Pick<
  CatalogFormat,
  "entryType" | "playersPerTeam" | "minRoster" | "maxRoster" | "teamsPerMatch" | "maxPlayersPerMatch"
>;

/** Most entries a single match/lobby can hold, or null if unbounded. */
export function entriesPerMatch(format: FormatShape): number | null {
  if (format.teamsPerMatch !== null && format.maxPlayersPerMatch === null) return format.teamsPerMatch;
  if (format.maxPlayersPerMatch === null) return format.teamsPerMatch;
  const byCap = Math.floor(format.maxPlayersPerMatch / format.playersPerTeam);
  return format.teamsPerMatch === null ? byCap : Math.min(byCap, format.teamsPerMatch);
}

/** "Individual" / "4 players per team" / "4 players per team (up to 6 with subs)". */
export function describeEntry(format: FormatShape): string {
  if (format.entryType === "INDIVIDUAL") return "Individual · 1 player";
  const min = format.minRoster ?? format.playersPerTeam;
  const max = format.maxRoster ?? format.playersPerTeam;
  const base = `${format.playersPerTeam} players per team`;
  if (min === max) return base;
  if (min < format.playersPerTeam && max > format.playersPerTeam) return `${base} · roster ${min}–${max}`;
  if (max > format.playersPerTeam) return `${base} · up to ${max} with subs`;
  return `${base} · min ${min} to register`;
}

/** "4v4" for head-to-head; "Up to 100 players · 25 teams per lobby" for lobbies. */
export function describeMatch(format: FormatShape, style: CompetitionStyle): string {
  if (style === "HEAD_TO_HEAD") return `${format.playersPerTeam}v${format.playersPerTeam}`;
  const entries = entriesPerMatch(format);
  const unit = format.entryType === "TEAM" ? "teams" : "players";
  const parts: string[] = [];
  if (format.maxPlayersPerMatch) parts.push(`Up to ${format.maxPlayersPerMatch} players`);
  if (entries && format.entryType === "TEAM") parts.push(`${entries} ${unit} per lobby`);
  return parts.join(" · ") || "Multiple entries per lobby";
}

export function describeStructures(ids: string[]): string {
  return ids.map((id) => getStructure(id)?.label ?? id).join(", ");
}

/** What blocks publishing, or null if the game is ready. */
export function publishBlocker(modes: Pick<CatalogMode, "enabled" | "formats">[]): string | null {
  const playable = modes.some((m) => m.enabled && m.formats.some((f) => f.enabled));
  return playable ? null : "Add at least one active mode with an active format before publishing.";
}
