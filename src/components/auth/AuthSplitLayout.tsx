import Link from "next/link";
import { CINEMATIC_GAMING_IMAGE, unsplashUrl } from "@/lib/gameImagery";

/**
 * Circuit — shared shell for the four auth pages (login, signup,
 * forgot-password, reset-password): a real photo on one side, the form
 * on the other. The image is the same cinematic gaming-setup photo
 * `CircuitHero`/`SidebarPromoCard`-adjacent surfaces already reuse for
 * "brand mood, no specific game" placements (see gameImagery.ts's own
 * comment on `CINEMATIC_GAMING_IMAGE`) — not a new asset. The headline
 * and subhead are the exact real copy already established on
 * `SidebarPromoCard` ("Play. Connect. Compete." / "Real tournaments,
 * real opponents, real payouts."), reused rather than invented.
 *
 * Hidden below `lg` — the image is brand dressing, not load-bearing;
 * mobile gets the form full-width with its own logo instead. At `lg`+,
 * both halves are an explicit, equal 50/50 split (`lg:w-1/2` on both),
 * form on the left, image on the right.
 *
 * These routes render outside the normal app shell (see AppShell.tsx),
 * so this component owns the full viewport itself.
 */
export function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <div className="flex w-full flex-col items-center justify-center px-6 py-16 lg:w-1/2 lg:shrink-0">
        <div className="w-full max-w-sm">{children}</div>
      </div>

      <div
        data-surface="dark"
        className="relative hidden shrink-0 flex-col justify-between overflow-hidden p-10 lg:flex lg:w-1/2 xl:p-14"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external CDN photo, same asset CircuitHero uses */}
        <img
          src={unsplashUrl(CINEMATIC_GAMING_IMAGE, 1400)}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(190deg, rgba(10,10,12,0.25), rgba(10,10,12,0.85))" }}
        />

        <Link href="/" className="relative z-10 flex w-fit items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
          <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-9 w-auto max-w-none" />
        </Link>

        <div className="relative z-10 flex flex-col gap-2">
          <span className="font-display text-4xl leading-[0.95] font-bold tracking-tight text-white uppercase xl:text-5xl">
            Play.
            <br />
            Connect.
            <br />
            <span className="text-accent-volt">Compete.</span>
          </span>
          <p className="max-w-sm text-sm text-white/70">Real tournaments, real opponents, real payouts.</p>
        </div>
      </div>
    </div>
  );
}
