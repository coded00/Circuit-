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
 * time for the same name. See gameImagery.ts's own header comment: its
 * one generic cinematic photo is reserved for hero/promo surfaces that
 * don't name a specific game (e.g. CircuitHero), not a per-tile stand-in
 * here — two unrelated tournaments with unrecognized games showing the
 * literal same stock photo reads as a templated placeholder.
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
  imgWidth = 480,
  fill = false,
  children,
}: {
  game: string;
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
  const photo = realGameImage(game);
  const tint = gameTint(game);

  return (
    <div
      className={`${fill ? "absolute inset-0" : "relative"} overflow-hidden ${className}`}
      style={
        photo
          ? undefined
          : { backgroundImage: `linear-gradient(155deg, ${tint}, var(--surface) 85%)` }
      }
    >
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element -- external CDN, arbitrary sizes per call site
        <img
          src={unsplashUrl(photo, imgWidth)}
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
