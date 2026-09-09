/**
 * Circuit — cover-art tile. No Game catalog/cover-art model exists
 * (Tournament.game/Battle.game are free-text), so there's no real photo
 * library that could cover an arbitrary, organizer-typed game name.
 *
 * For the small, fixed set of well-known games this UI references by
 * name elsewhere (see gameImagery.ts), this renders a real, verified
 * photo. For anything outside that set — which is most tournaments, since
 * organizers type any game name — it falls back to the same deterministic
 * gradient-tint treatment as before: no image request, same look every
 * time for the same name.
 */

import { realGameImage, unsplashUrl } from "@/lib/gameImagery";

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

export function GameArtTile({
  game,
  className = "",
  hideLabel = false,
  children,
}: {
  game: string;
  className?: string;
  /** For thumbnails too small to fit readable text (e.g. a 36px ranking
   *  icon) where the game name is already shown as separate text nearby. */
  hideLabel?: boolean;
  children?: React.ReactNode;
}) {
  const photo = realGameImage(game);
  const tint = gameTint(game);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={
        photo
          ? undefined
          : { backgroundImage: `linear-gradient(155deg, ${tint}, var(--surface) 85%)` }
      }
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- external CDN, arbitrary sizes per call site
        <img
          src={unsplashUrl(photo, 480)}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {!hideLabel && (
        <>
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-2/3"
            style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}
          />
          <span className="absolute right-3 bottom-2 left-3 truncate text-sm font-bold tracking-tight text-white">
            {game}
          </span>
        </>
      )}
      {children}
    </div>
  );
}
