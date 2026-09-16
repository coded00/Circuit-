"use client";

import Link from "next/link";
import { useSpotlight } from "@/lib/useSpotlight";
import { CINEMATIC_GAMING_IMAGE, realGameImage, unsplashUrl } from "@/lib/gameImagery";
import { tournamentPath } from "@/lib/seo";

/**
 * Circuit — homepage hero. "Dark to compete" starts here: the one
 * `data-surface="dark"` scope on the homepage (see globals.css), a
 * cinematic real photo (verified Unsplash CDN URL, see gameImagery.ts)
 * with a left-to-right dark gradient keeping the headline/CTAs readable.
 *
 * A real carousel: if the admin has published any `HomepageBanner` rows
 * (Content > Homepage Carousel), those ARE slide 0+, real admin-authored
 * content — this is the literal mechanism behind "update the player
 * homepage without touching code." With no banners published, slide 0
 * falls back to Circuit's own static brand pitch, same as before. Either
 * way, real live/featured tournaments (same data `FeaturedCompetitions`
 * uses) always follow as the remaining slides.
 */

type Tournament = {
  id: string;
  name: string;
  game: string;
  entryFee: number;
  participantCap: number;
  prizeAmount: number | null;
  _count: { registrations: number };
};

type Banner = {
  id: string;
  headline: string;
  description: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaHref: string | null;
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export function CircuitHero({ tournaments = [], banners = [] }: { tournaments?: Tournament[]; banners?: Banner[] }) {
  const spotlightTournaments = tournaments.slice(0, 2);
  const bannerSlideCount = banners.length > 0 ? banners.length : 1; // 1 = the static brand-pitch fallback
  const slideCount = bannerSlideCount + spotlightTournaments.length;
  const { index, goTo } = useSpotlight(slideCount, { autoAdvance: slideCount > 1 });

  const tournament = index >= bannerSlideCount ? spotlightTournaments[index - bannerSlideCount] : null;
  const banner = !tournament && banners.length > 0 ? banners[index] : null;

  const photo = tournament ? (realGameImage(tournament.game) ?? CINEMATIC_GAMING_IMAGE) : CINEMATIC_GAMING_IMAGE;

  return (
    <div
      data-surface="dark"
      className="relative flex h-[280px] w-full overflow-hidden rounded-[16px] border border-border sm:h-[320px] lg:h-[360px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external CDN hero photo, or an admin-pasted banner URL */}
      <img
        key={banner ? banner.imageUrl : photo}
        src={banner ? banner.imageUrl : unsplashUrl(photo, 1400)}
        alt=""
        aria-hidden
        className="motion-fade-in absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--background) 0%, color-mix(in srgb, var(--background) 92%, transparent) 30%, color-mix(in srgb, var(--background) 55%, transparent) 58%, color-mix(in srgb, var(--background) 25%, transparent) 100%)",
        }}
      />

      {/* Keyed on slide index so each real carousel advance (tournament,
          admin banner, or the static fallback) crossfades in rather than
          hard-cutting — the same content, just not an abrupt swap. */}
      <div
        key={index}
        className="motion-fade-in relative z-10 flex h-full w-full max-w-[520px] flex-col justify-center gap-2.5 p-6 sm:gap-3 sm:p-8 lg:p-10"
      >
        {tournament ? (
          <>
            <span className="text-eyebrow text-accent-volt">{tournament.game}</span>
            <h1 className="text-hero line-clamp-2">
              {tournament.name}
            </h1>
            <p className="max-w-[440px] text-sm text-muted sm:text-base">
              {tournament.prizeAmount
                ? `₦${(tournament.prizeAmount / 100).toLocaleString("en-NG")} prize pool · `
                : tournament.entryFee === 0
                  ? "Free entry · "
                  : `${formatNaira(tournament.entryFee)} entry · `}
              {tournament._count.registrations}/{tournament.participantCap} players
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href={tournamentPath(tournament)} className="btn-primary">
                View Competition →
              </Link>
            </div>
          </>
        ) : banner ? (
          <>
            <h1 className="text-hero line-clamp-2">{banner.headline}</h1>
            {banner.description && <p className="max-w-[440px] text-sm text-muted sm:text-base">{banner.description}</p>}
            {banner.ctaLabel && banner.ctaHref && (
              <div className="flex flex-wrap gap-3 pt-1">
                <Link href={banner.ctaHref} className="btn-primary">
                  {banner.ctaLabel} →
                </Link>
              </div>
            )}
          </>
        ) : (
          <>
            <span className="text-eyebrow">Play · Compete · Connect</span>
            <h1 className="text-hero line-clamp-2">
              More Games
              <br />
              <span className="text-accent-volt">Bigger Moments</span>
            </h1>
            <p className="max-w-[440px] text-sm text-muted sm:text-base">
              Join tournaments, challenge players, and be part of a growing gaming community.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="#featured" className="btn-primary">
                Start Competing →
              </Link>
            </div>
          </>
        )}
      </div>

      {slideCount > 1 && (
        <div className="absolute bottom-5 left-8 z-10 flex gap-1.5 sm:left-10">
          {Array.from({ length: slideCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-accent-volt" : "w-1.5 bg-foreground/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
