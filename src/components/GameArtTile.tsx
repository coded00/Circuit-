/**
 * Circuit — generated cover-art tile. No Game catalog/cover-art model
 * exists (Tournament.game/Battle.game are free-text), and no real
 * photography or licensing path exists to source real cover art. This
 * renders a deterministic (same game → same look every time, SSR/CSR
 * stable) tinted-vignette treatment with the game name overlaid,
 * evoking an image-led card without any image request.
 *
 * Every entry resolves to near-black — one shared "dark box-art vignette"
 * feel with a different accent tint per game, rather than blending two
 * saturated hues (the two-bright-colors-diagonally trick reads as a
 * generic AI-gradient-generator default, not an intentional card system).
 */

const PALETTE: readonly string[] = [
  "#2f2a5c", // indigo
  "#3a1f52", // violet
  "#1e3350", // slate blue
  "#153f3c", // deep teal
  "#4a1f3d", // plum
  "#1f2937", // charcoal blue
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

export function GameArtTile({
  game,
  className = "",
  children,
}: {
  game: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const tint = gameTint(game);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundImage: `linear-gradient(160deg, ${tint}, #0b0d10 85%)` }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}
      />
      <span className="absolute bottom-2 left-3 right-3 truncate text-sm font-bold tracking-tight text-white">
        {game}
      </span>
      {children}
    </div>
  );
}
