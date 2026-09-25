"use client";

/**
 * Circuit — cover-art tile. Image priority, most specific first:
 * 1. `posterUrl` — the organizer's own art for this exact competition;
 * 2. the game's admin-uploaded cover/icon from the Game catalog (via
 *    GameImageProvider — this is what makes a newly published game's
 *    image show up everywhere its name appears);
 * 3. a verified stock photo for the few well-known games in
 *    gameImagery.ts;
 * 4. a deterministic gradient tint — no image request, same look every
 *    time for the same name.
 */

import { realGameImage, unsplashUrl } from "@/lib/gameImagery";
import { useGameImage } from "@/components/GameImageProvider";
import { gameTint } from "@/lib/gameTint";

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
  const catalogImage = useGameImage(game);
  const stockPhoto = realGameImage(game);
  const imageSrc = posterUrl || catalogImage || (stockPhoto ? unsplashUrl(stockPhoto, imgWidth) : null);
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
