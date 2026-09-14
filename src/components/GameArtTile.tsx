/**
 * Circuit — cover-art tile. No Game catalog/cover-art model exists
 * (Tournament.game/Battle.game are free-text), so there's no real photo
 * library that could cover an arbitrary, organizer-typed game name.
 *
 * A real, organizer-uploaded `posterUrl` (Tournament's own field — see
 * that model's schema comment) always takes priority when passed: this
 * is the actual event's own art, not a generic stand-in, so it wins over
 * everything else below regardless of whether the game name is
 * recognized. Only once there's no real poster does this fall back to:
 * for the small, fixed set of well-known games this UI references by
 * name elsewhere (see gameImagery.ts), a real, verified stock photo; for
 * anything else, the same deterministic gradient-tint treatment as
 * before: no image request, same look every time for the same name.
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
  posterUrl,
  className = "",
  hideLabel = false,
  imgWidth = 480,
  fill = false,
  children,
}: {
  game: string;
  /** A real, organizer-uploaded tournament poster — takes priority over
   *  the per-game stock photo/gradient fallback below when set. */
  posterUrl?: string | null;
  className?: string;
  /** For thumbnails too small to fit readable text (e.g. a 36px ranking
   *  icon) where the game name is already shown as separate text nearby. */
  hideLabel?: boolean;
  /** Source width to request from Unsplash — the default suits every
   *  small/medium tile (grid cards, thumbnails). Bump this for a
   *  full-width banner use (e.g. a tournament page hero), otherwise a
   *  480px source gets visibly upscaled/soft stretched across a much
   *  wider container. */
  imgWidth?: number;
  /** Root positions itself with `absolute inset-0` (to fill an
   *  already-positioned ancestor, e.g. a hero banner) instead of the
   *  default `relative`. A plain `className="absolute inset-0"` can't do
   *  this reliably — Tailwind resolves the `relative`/`absolute`
   *  conflict by generated CSS order, not by which class was passed
   *  last, so the hardcoded `relative` below can silently win and leave
   *  the tile unpositioned (and invisible) inside a hero. */
  fill?: boolean;
  children?: React.ReactNode;
}) {
  const stockPhoto = realGameImage(game);
  const imageSrc = posterUrl || (stockPhoto ? unsplashUrl(stockPhoto, imgWidth) : null);
  const tint = gameTint(game);

  return (
    <div
      className={`${fill ? "absolute inset-0" : "relative"} overflow-hidden ${className}`}
      style={
        imageSrc
          ? undefined
          : { backgroundImage: `linear-gradient(155deg, ${tint}, var(--surface) 85%)` }
      }
    >
      {imageSrc && (
        // eslint-disable-next-line @next/next/no-img-element -- external/arbitrary-host image (Unsplash or an organizer-pasted poster URL), arbitrary sizes per call site
        <img
          src={imageSrc}
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
