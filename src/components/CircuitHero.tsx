"use client";

import Link from "next/link";
import { useSpotlight } from "@/lib/useSpotlight";
import { CINEMATIC_GAMING_IMAGE, realGameImage, unsplashUrl } from "@/lib/gameImagery";
import { tournamentPath } from "@/lib/seo";

/**
 * Circuit — homepage hero. "Dark to compete" starts here: the one
 * `data-surface="dark"` scope on the homepage (see globals.css), a
 * cinematic real photo (verified Unsplash CDN URL, see gameImagery.ts)
 * with a left-side fade keeping the headline/CTAs readable, and a strip
 * of live platform numbers (open tournaments, challenges, prize money)
 * underneath.
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

export type PlatformStats = {
  openTournaments: number;
  openChallenges: number;
  prizeMoney: number;
};

export function CircuitHero({
  tournaments = [],
  banners = [],
  stats,
}: {
  tournaments?: Tournament[];
  banners?: Banner[];
  /** Live platform numbers shown under the slides — real counts/sums. */
  stats?: PlatformStats;
}) {
  const spotlightTournaments = tournaments.slice(0, 2);
  const bannerSlideCount = banners.length > 0 ? banners.length : 1; // 1 = the static brand-pitch fallback
  const slideCount = bannerSlideCount + spotlightTournaments.length;
  const { index, goTo } = useSpotlight(slideCount, {
    autoAdvance: slideCount > 1,
  });

  const tournament = index >= bannerSlideCount ? spotlightTournaments[index - bannerSlideCount] : null;
  const banner = !tournament && banners.length > 0 ? banners[index] : null;

  const photo = tournament ? (realGameImage(tournament.game) ?? CINEMATIC_GAMING_IMAGE) : CINEMATIC_GAMING_IMAGE;

  return (
    <div
      data-surface="dark"
      className="flex w-full flex-col overflow-hidden rounded-[var(--radius-hero)] border border-border bg-surface"
    >
      <div className="relative flex h-[280px] w-full overflow-hidden sm:h-[320px] lg:h-[340px]">
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
              "linear-gradient(90deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 85%, transparent) 38%, transparent 75%)",
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
              <span className="text-eyebrow text-accent-volt">Featured · {tournament.game}</span>
              <h1 className="text-hero line-clamp-2">{tournament.name}</h1>
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
                  View tournament
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
              <h1 className="text-hero line-clamp-3">
                Compete on the games
                <br />
                <span className="text-accent-volt">you already play</span>
              </h1>
              <p className="max-w-[440px] text-sm text-muted sm:text-base">
                Tournaments with real prize pools and 1v1 challenges — CODM, EA FC, PUBG Mobile and more.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href="/compete" className="btn-primary">
                  Find a tournament
                </Link>
                <Link href="/battles" className="btn-secondary">
                  Challenge a player
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
      {stats && (
        <dl className="grid grid-cols-3 gap-px border-t border-border bg-border">
          {[
            {
              label: "Open tournaments",
              value: stats.openTournaments.toLocaleString("en-NG"),
            },
            {
              label: "Challenges waiting",
              value: stats.openChallenges.toLocaleString("en-NG"),
            },
            {
              label: "Prize money",
              value: formatNaira(stats.prizeMoney),
              gold: true,
            },
          ].map((item) => (
            <div key={item.label} className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3 sm:px-8 sm:py-4">
              <dt className="truncate text-[10px] font-medium tracking-wide text-muted uppercase sm:text-[11px]">{item.label}</dt>
              <dd className={`text-stat truncate text-base sm:text-xl ${item.gold ? "text-gold" : ""}`}>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
