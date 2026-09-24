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
  "ea fc": "https://images.unsplash.com/photo-1745997645080-941f962f1392",
  fortnite: "https://images.unsplash.com/photo-1750274077417-8765b230e311",
  "gta v": "https://images.unsplash.com/photo-1616063971315-5500225a0aaf",
  "apex legends": "https://images.unsplash.com/photo-1558743941-459179fe00e7",
  efootball: "https://images.unsplash.com/photo-1569531955323-33c6b2dca44b",
  "rocket league": "https://images.unsplash.com/photo-1760604359281-b738de589439",
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

/** A generically evocative accent color per well-known game (a shooter
 *  reads red, a football title reads green, etc.) — descriptive color
 *  choice only, not any game's actual trademarked brand color/logo. Used
 *  by the win-share-card's edge accent bar. Falls back to the same
 *  deterministic hash-based palette `gameTint` (GameArtTile.tsx) already
 *  uses for any game outside this curated set, so an unrecognized game
 *  still gets a consistent, non-random accent rather than none at all. */
export const GAME_ACCENTS: Record<string, string> = {
  valorant: "#ff4655",
  "call of duty mobile": "#e8912d",
  "call of duty": "#e8912d",
  "apex legends": "#da292a",
  "ea fc": "#1ea896",
  efootball: "#1ea896",
  fortnite: "#8e5ff5",
  "gta v": "#f5a623",
  "rocket league": "#2f8fe0",
  "delta force": "#6b7280",
};

export function gameAccent(game: string, fallback: (game: string) => string): string {
  const normalized = game.trim().toLowerCase();
  if (GAME_ACCENTS[normalized]) return GAME_ACCENTS[normalized];
  const key = Object.keys(GAME_ACCENTS)
    .sort((a, b) => b.length - a.length)
    .find((k) => normalized.includes(k));
  return key ? GAME_ACCENTS[key] : fallback(game);
}
