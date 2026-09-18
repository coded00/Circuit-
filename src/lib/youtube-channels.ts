/**
 * Circuit Video Feed — curated YouTube source list (Phase 3). Every entry
 * here is a channel the user explicitly approved; `scripts/ingest-youtube.mjs`
 * only ever pulls from channels in this file — there is no keyword-search
 * ingestion, so nothing enters the feed from a channel nobody signed off
 * on. Handles/ids were verified against each channel's real, current
 * YouTube page (a couple of these have moved handles before, so an id is
 * given wherever it's the more stable identifier).
 */

export type YouTubeChannelConfig = {
  /** Display label — used as `Video.sourceAuthor` for attribution. */
  name: string;
  /** Either a handle (with the leading "@") or a raw channel id (starts
   *  "UC...") — both are valid `channels.list` lookup keys. */
  handleOrId: string;
};

export const YOUTUBE_CHANNELS: YouTubeChannelConfig[] = [
  // Gaming news & commentary
  { name: "Gameranx", handleOrId: "@gameranxTV" },
  { name: "IGN", handleOrId: "@IGN" },
  { name: "GameSpot", handleOrId: "@gamespot" },
  { name: "Spawn Wave", handleOrId: "@SpawnWave" },
  // Shorts, reels & viral clips
  { name: "Chuster", handleOrId: "UCKEiTu4t6o2Y9hnqOS-GUgw" },
  { name: "Daily Dose of Gaming", handleOrId: "@Daily.Dose.Of.Gaming." },
  { name: "Highlight Reel", handleOrId: "@HighlightReel" },
  { name: "The Game Awards", handleOrId: "@thegameawards" },
  // Platform & community clips
  { name: "PlayStation", handleOrId: "@PlayStation" },
  { name: "Xbox", handleOrId: "@xbox" },
];
