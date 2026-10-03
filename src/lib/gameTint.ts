/**
 * Circuit — deterministic per-game tint, the no-image fallback behind
 * GameArtTile and the share-card images. A plain module (not the client
 * GameArtTile) so server routes can call it too.
 */

const PALETTE: readonly string[] = [
  "#1e3a8a", // deep blue
  "#4c1d95", // deep violet
  "#0e5a6b", // deep cyan-teal
  "#312e81", // indigo
  "#1e1b4b", // near-black indigo
  "#164e63", // slate cyan
];

function hashGameName(game: string): number {
  let hash = 0;
  for (let i = 0; i < game.length; i++) {
    hash = (hash * 31 + game.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function gameTint(game: string): string {
  return PALETTE[hashGameName(game) % PALETTE.length];
}
