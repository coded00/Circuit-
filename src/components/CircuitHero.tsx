import Link from "next/link";
import { CINEMATIC_GAMING_IMAGE, unsplashUrl } from "@/lib/gameImagery";

/**
 * Circuit — homepage hero. "Dark to compete" starts here: the one
 * `data-surface="dark"` scope on the homepage (see globals.css), a
 * cinematic real photo (verified Unsplash CDN URL, see gameImagery.ts)
 * with a left-to-right dark gradient keeping the headline/CTAs readable.
 *
 * No stat row — the MVP rework spec's hero content doesn't call for one,
 * and the old 250K+/10K+/1M+ figures were only ever authorized as
 * illustrative placeholders under the now-superseded prior spec; dropped
 * rather than carried forward without that authorization.
 */
export function CircuitHero() {
  return (
    <div
      data-surface="dark"
      className="relative flex min-h-[340px] w-full overflow-hidden rounded-[16px] border border-border"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external CDN hero photo */}
      <img
        src={unsplashUrl(CINEMATIC_GAMING_IMAGE, 1400)}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--background) 0%, color-mix(in srgb, var(--background) 92%, transparent) 30%, color-mix(in srgb, var(--background) 55%, transparent) 58%, color-mix(in srgb, var(--background) 25%, transparent) 100%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-[560px] flex-col justify-center gap-4 p-8 sm:p-10">
        <span className="text-eyebrow">Circuit</span>

        <h1 className="text-hero" style={{ fontStyle: "italic" }}>
          Enter The
          <br />
          <span className="text-accent-volt">Circuit.</span>
        </h1>

        <p className="max-w-[440px] text-sm text-muted sm:text-base">
          Discover competitions. Challenge players. Compete for rewards.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <Link href="#featured" className="btn-primary">
            ⚡ Explore Competitions
          </Link>
          <Link href="/battles/new" className="btn-secondary bg-black/20 backdrop-blur-sm">
            Challenge a Player
          </Link>
        </div>
      </div>
    </div>
  );
}
