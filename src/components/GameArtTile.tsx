/**
 * Circuit — generated cover-art tile. No Game catalog/cover-art model
 * exists (Tournament.game/Battle.game are free-text), and no real
 * photography or licensing path exists to source real cover art. This
 * renders a deterministic (same game → same look every time, SSR/CSR
 * stable) gradient + diagonal-stripe treatment with the game name
 * overlaid, evoking an image-led card without any image request.
 */

type GradientPair = readonly [string, string];

const PALETTE: readonly GradientPair[] = [
  ["#7c3aed", "#4338ca"], // violet -> indigo
  ["#c026d3", "#7c3aed"], // fuchsia -> violet
  ["#7c3aed", "#2563eb"], // violet -> blue
  ["#e11d48", "#7c3aed"], // rose -> violet
  ["#f59e0b", "#7c3aed"], // amber -> violet
  ["#14b8a6", "#4338ca"], // teal -> indigo
  ["#4338ca", "#0b0d10"], // indigo -> near-black
  ["#ec4899", "#7c3aed"], // pink -> violet
];

function hashGameName(game: string): number {
  let hash = 0;
  for (let i = 0; i < game.length; i++) {
    hash = (hash * 31 + game.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function gameGradient(game: string): GradientPair {
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
  const [from, to] = gameGradient(game);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 40px)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3"
        style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}
      />
      <span className="absolute bottom-2 left-3 right-3 truncate text-sm font-bold tracking-tight text-white uppercase">
        {game}
      </span>
      {children}
    </div>
  );
}
