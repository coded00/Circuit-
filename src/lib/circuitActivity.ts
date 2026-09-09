/**
 * Circuit — static "platform activity" figures shared by ExploreTheCircuit
 * (Phase 8) and CircuitPulse (Phase 11). No analytics backend exists to
 * measure real per-game concurrent players, so these are illustrative
 * values per explicit product decision — kept in one place so the two
 * sections that both reference "how many people are on X game right now"
 * can never silently drift apart. Order here matches Phase 8's own
 * display order; CircuitPulse sorts its own copy by count for its
 * ranking.
 */
export const GAME_ACTIVITY = [
  { name: "Call of Duty", connected: "84K" },
  { name: "Valorant", connected: "62K" },
  { name: "EA FC 25", connected: "31K" },
  { name: "Fortnite", connected: "77K" },
  { name: "GTA V", connected: "28K" },
] as const;
