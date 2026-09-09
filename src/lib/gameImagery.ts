/**
 * Circuit — real photography for the small, fixed set of well-known games
 * this UI references by name (Explore the Circuit, Circuit Pulse, Live on
 * Circuit's example streams). Every URL below was fetched and verified
 * (HTTP 200) against Unsplash's CDN before being added here — all Unsplash-
 * licensed (free for commercial use, no attribution required).
 *
 * This is deliberately NOT a general solution for `GameArtTile`'s other
 * callers (TournamentGrid, dashboard, etc.), which render an arbitrary
 * free-text `Tournament.game` string an organizer typed in — there's no
 * real photo library that could cover an unbounded, user-entered game
 * name, so those keep the generated gradient-tint fallback. Real imagery
 * only where the game is one of this known, curated set.
 */
export const GAME_IMAGES: Record<string, string> = {
  "call of duty": "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf",
  valorant: "https://images.unsplash.com/photo-1644560286950-1807431fc64f",
  "ea fc 25": "https://images.unsplash.com/photo-1745997645080-941f962f1392",
  fortnite: "https://images.unsplash.com/photo-1750274077417-8765b230e311",
  "gta v": "https://images.unsplash.com/photo-1616063971315-5500225a0aaf",
};

/** Case-insensitive, substring-tolerant lookup — "Call of Duty: Warzone"
 *  still matches the "call of duty" entry. Returns null for anything
 *  outside the known set. */
export function realGameImage(game: string): string | null {
  const normalized = game.trim().toLowerCase();
  if (GAME_IMAGES[normalized]) return GAME_IMAGES[normalized];
  const match = Object.keys(GAME_IMAGES).find((key) => normalized.includes(key));
  return match ? GAME_IMAGES[match] : null;
}

/** A cinematic gaming-setup photo for the hero/promo cards that don't name
 *  a specific game. */
export const CINEMATIC_GAMING_IMAGE = "https://images.unsplash.com/photo-1616588589676-62b3bd4ff6d2";

/** Streamer-at-desk portraits, standing in for the facecam overlay across
 *  LiveOnCircuit's illustrative rotating streams — see that file's own
 *  header comment for why the streams themselves are fabricated content.
 *  Three distinct people so the rotating carousel doesn't show the same
 *  face under three different names. */
export const STREAMER_PORTRAIT_IMAGES = [
  "https://images.unsplash.com/photo-1560419398-c36ab8c174b0",
  "https://images.unsplash.com/photo-1551421250-99978a013168",
  "https://images.unsplash.com/photo-1633268288844-28df1f1f68d9",
] as const;

/** Builds an Unsplash CDN URL with sizing/format params. */
export function unsplashUrl(baseUrl: string, width: number, quality = 80): string {
  return `${baseUrl}?w=${width}&q=${quality}&auto=format&fit=crop`;
}
