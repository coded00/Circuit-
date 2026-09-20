/**
 * Circuit — default "starting point" rules text for the tournament
 * create/edit forms' required Rules field. An organizer previously faced
 * a blank required textarea with zero guidance; this gives them a real,
 * researched-against-official-sources template for their game that they
 * can accept as-is or edit, instead of writing a ruleset from scratch.
 *
 * Same shape and convention as `gameFormats.ts`: a curated map for games
 * with a real, verifiable competitive convention, case-insensitive/
 * substring-tolerant lookup, and an honest generic fallback for anything
 * else — never invents an official-sounding ruleset for a game that
 * doesn't actually have one (see "gta v" below, which is deliberately
 * generic rather than pretending a standard exists).
 */

export const GAME_RULES: Record<string, string> = {
  valorant: `- Standard: first to 13 round wins takes the map. At 12-12, overtime is win-by-2, sudden death if it stays tied.
- Agree Bo1 or Bo3 maps before the match starts.
- Play in a custom lobby (free to set up) rather than public matchmaking, so both players are guaranteed to be in the same game.
- Winner submits a screenshot of the final scoreboard showing the map score and both usernames.
- No third-party overlays, wallhacks, or exploits. Screen recording is encouraged for dispute review.`,

  "call of duty mobile": `- Battle Royale: last player/squad standing wins — no rounds.
- Team Deathmatch 5v5: first to 50 eliminations or time limit.
- Search & Destroy 5v5: no respawns, first to 4 round wins takes the match.
- Gunfight 2v2: standardized loadouts, first to 6 round wins.
- Winner submits the post-match results screen showing both usernames and the score/placement.
- No emulator/macro exploits or third-party aim tools. Screen recording is encouraged for dispute review.`,

  "call of duty": `- Hardpoint 4v4: most cumulative hill time (or time-limit lead) wins the map.
- Search & Destroy 4v4: no respawns — most rounds won takes the match.
- Control 4v4: attackers capture both zones before time expires, or defenders hold.
- Team Deathmatch 6v6: first to the elimination target or time limit.
- Agree a best-of format up front (Bo3 is a reasonable default for a small bracket).
- Winner submits the final scoreboard screenshot. No unauthorized software, boosting, or ghosting.`,

  "apex legends": `- Squad-based Battle Royale — last squad standing is the winner of that game, not a head-to-head match.
- For a multi-game series: award placement points plus 1 point per elimination: highest combined score wins.
- Winning squad submits the end-of-match results screen showing placement, squad names, and kills.
- No third-party software and no unauthorized teaming between squads.
- Screen recording is encouraged for placement/kill disputes near the end of a match.`,

  "ea fc": `- Single match decides the winner — higher score at full time wins.
- A draw in a knockout match goes to extra time, then penalties.
- Agree match length/half length and difficulty/settings before kickoff.
- Winner submits a screenshot of the final score showing both usernames/clubs.
- No exploits. No disconnecting to avoid a loss — reconnect and finish, or forfeit.`,

  efootball: `- Agree match length before kickoff — community brackets commonly run 6-12 minute halves; there's no single universal default, so state it in this tournament's own rules.
- A draw in a knockout match goes to extra time, then penalties.
- Winner submits a screenshot of the final score.
- No exploits. No disconnecting to avoid a loss — reconnect and finish, or forfeit.`,

  fortnite: `- Battle Royale: last player/team standing gets the Victory Royale. Zero Build disables building/editing — everything else is the same.
- Not naturally head-to-head: for a bracket, score each match by placement plus eliminations, or treat it as placement-only.
- Coordinate queuing into the same public match together — Epic's private Custom Matchmaking Key isn't realistically available to most organizers.
- Both players submit a screenshot of the end-of-match results screen showing placement, eliminations, and both usernames.
- No cheats, exploits, or third-party overlays.`,

  "rocket league": `- Each game: 5-minute regulation, most goals wins.
- Tied at time expiry: sudden-death overtime, next goal wins, no time limit.
- Agree a series length up front (Bo3 is a reasonable default for a small bracket).
- Winner submits a screenshot of the final in-game score screen. A replay or screen recording is encouraged since goal-line calls are a common dispute point.
- No boost/speed mods or unauthorized macros.`,

  // Delta Force has no established, standardized competitive ruleset yet
  // (a 2025 title still maturing its competitive scene) — same honesty
  // as GTA V below rather than inventing one.
  "delta force": `- Delta Force doesn't yet have an established competitive/esports ruleset — state the exact mode (Havoc Warfare, Hazard Operations, Hot Zone, etc.) and win condition in this tournament's own rules.
- Both players/teams should agree the mode and win condition before the match starts.
- Submit a screenshot or recording of the final results screen as proof.
- No mod menus, cheats, or exploits. Be on time for the scheduled match — no-shows forfeit.`,

  // GTA V/GTA Online has no official ranked mode and no recognized
  // competitive circuit — it's an open-world sandbox, not built for
  // bracket play. Deliberately generic, not a fabricated "official" set.
  "gta v": `- GTA V has no standard competitive ruleset — state the exact game mode/session type (Deathmatch, Race, Capture, etc.) in this tournament's own rules.
- Both players should agree the win condition before starting, since Circuit isn't defining one for this game.
- Screen-record or screenshot the final results/scoreboard as proof.
- No mod menus, cheats, or lobby exploits.
- Be on time for the scheduled match — no-shows forfeit.`,
};

/** Generic fallback for any game not in the curated set above — honest
 *  organizer-facing boilerplate, not a fabricated per-game ruleset. */
const GENERIC_RULES = `- State the exact match format and win condition for this game in your own words below.
- Agree the format (Bo1/Bo3, match length, etc.) with your opponent before the match starts.
- Winner submits a screenshot of the final score/results screen as proof.
- No cheats, exploits, or third-party software. Be on time for the scheduled match — no-shows forfeit.`;

/** Case-insensitive, substring-tolerant lookup, longest key first —
 *  matches `gameFormatOptions`'s own lookup so the two never disagree
 *  about which curated game a name resolves to. Always returns *some*
 *  usable starting text, never an empty string. */
export function defaultRulesFor(game: string): string {
  const normalized = game.trim().toLowerCase();
  if (GAME_RULES[normalized]) return GAME_RULES[normalized];
  const key = Object.keys(GAME_RULES)
    .sort((a, b) => b.length - a.length)
    .find((k) => normalized.includes(k));
  return key ? GAME_RULES[key] : GENERIC_RULES;
}
