/**
 * Circuit — real, per-game competitive formats for the "Game mode"
 * field on the tournament create/edit forms (`Tournament.teamSize` in the
 * schema — the column name predates this file and stayed as-is rather
 * than forcing a migration for a rename; it's really "which mode/format
 * this specific tournament runs").
 *
 * Same shape and matching convention as `gameImagery.ts`'s `GAME_IMAGES`:
 * a small, curated map for the well-known games this UI already
 * recognizes by name, case-insensitive/substring-tolerant lookup, and an
 * honest generic fallback (the original flat 1v1..5v5 list) for anything
 * outside that set — no invented format list for a game (e.g. GTA V) that
 * doesn't actually have one standard, recognized competitive structure.
 *
 * `Tournament.game`/`teamSize` are both plain strings, not foreign keys
 * or enums (see schema.prisma's own comments on both) — this module is
 * the single place that decides what's offered/accepted, imported by
 * both forms and both API routes so none of the four can drift out of
 * sync with each other.
 */

export const GENERIC_TEAM_SIZES = ["1v1", "2v2", "3v3", "4v4", "5v5"] as const;

export const GAME_FORMATS: Record<string, readonly string[]> = {
  "call of duty mobile": [
    "Battle Royale Solo",
    "Battle Royale Duo",
    "Battle Royale Squad",
    "Team Deathmatch 5v5",
    "Search & Destroy 5v5",
    "Gunfight 2v2",
  ],
  // Mainline/console Call of Duty — Call of Duty League plays 4-player
  // teams, distinct from Mobile's mostly-5v5/BR structure above.
  "call of duty": ["Hardpoint 4v4", "Search & Destroy 4v4", "Control 4v4", "Team Deathmatch 6v6"],
  valorant: ["Standard 5v5", "Swiftplay 5v5", "Spike Rush 5v5"],
  "apex legends": ["Battle Royale Trios", "Battle Royale Duos", "Ranked Trios"],
  fortnite: ["Battle Royale Solo", "Battle Royale Duo", "Battle Royale Squad", "Zero Build Solo", "Zero Build Duo"],
  // Matches "EA FC 25", "EA FC 26", etc. via substring — same yearly-
  // suffix handling gameImagery.ts already does for "ea fc".
  "ea fc": ["1v1 Head-to-Head", "2v2 Pro Clubs", "11v11 Pro Clubs"],
  efootball: ["1v1 Head-to-Head"],
  "rocket league": ["1v1 Duel", "2v2 Doubles", "3v3 Standard"],
};

/** Case-insensitive, substring-tolerant lookup, longest key first so a
 *  more specific name (e.g. "call of duty mobile") never gets shadowed
 *  by a shorter one that's also a substring of it ("call of duty").
 *  Falls back to the generic list for anything not in the curated set —
 *  never fabricates a per-game structure that doesn't really exist. */
export function gameFormatOptions(game: string): readonly string[] {
  const normalized = game.trim().toLowerCase();
  if (GAME_FORMATS[normalized]) return GAME_FORMATS[normalized];
  const key = Object.keys(GAME_FORMATS)
    .sort((a, b) => b.length - a.length)
    .find((k) => normalized.includes(k));
  return key ? GAME_FORMATS[key] : GENERIC_TEAM_SIZES;
}

/** Every value any game's dropdown could possibly submit — the real
 *  server-side whitelist, so a legitimate per-game selection never gets
 *  rejected as "not one of 1v1..5v5" the way a single flat enum would. */
export const ALL_TEAM_SIZE_VALUES: readonly string[] = Array.from(
  new Set([...GENERIC_TEAM_SIZES, ...Object.values(GAME_FORMATS).flat()])
);
