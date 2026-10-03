/**
 * Circuit — the shell every auth page sits in (login, signup, Google
 * onboarding/link, forgot/reset password). Laid out like a game launcher's
 * sign-in rather than a form card on a blank page:
 *
 * - lg+: a fixed-width dark panel (logo, the form, a quiet footer) beside
 *   the full-height key art. The art stays put; only the panel scrolls.
 *   The art, which carries live platform numbers along
 *   its bottom edge;
 * - below lg: the key art becomes a header (its baked-in logo and crown
 *   visible) that fades into the same dark panel.
 *
 * Always dark (`data-surface="dark"`): it continues the art instead of
 * sitting next to it. The art (`/public/auth-hero.jpg`) already contains
 * the logo and "More than a game" tagline, so nothing is overlaid on its
 * top half.
 *
 * These routes render outside the normal app shell (see AppShell.tsx),
 * so this component owns the full viewport itself.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";

function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (naira >= 1_000) return `₦${Math.round(naira / 1_000)}k`;
  return `₦${naira.toLocaleString("en-NG")}`;
}

/** Real numbers only — a stat that's zero is left out rather than shown as "0". */
async function platformStats(): Promise<{ label: string; value: string; live?: boolean }[]> {
  try {
    const [live, open, prize] = await Promise.all([
      prisma.tournament.count({ where: { status: "LIVE" } }),
      prisma.tournament.count({ where: { status: "OPEN" } }),
      prisma.tournament.aggregate({ where: { status: { in: ["OPEN", "LIVE"] } }, _sum: { prizeAmount: true } }),
    ]);
    const stats: { label: string; value: string; live?: boolean }[] = [];
    if (live > 0) stats.push({ value: String(live), label: live === 1 ? "tournament live" : "tournaments live", live: true });
    if (open > 0) stats.push({ value: String(open), label: "open for sign-up" });
    if (prize._sum.prizeAmount) stats.push({ value: formatNaira(prize._sum.prizeAmount), label: "up for grabs" });
    return stats;
  } catch {
    return [];
  }
}

export async function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  const stats = await platformStats();
  const year = new Date().getFullYear();

  return (
    // dvh, not vh/screen — iOS Safari's dynamic URL bar makes 100vh taller
    // than what's actually visible on load.
    // The panel uses the dark surface's own --background (set by
    // `data-surface="dark"`), and every fade below ends on that same var —
    // a hardcoded colour here would drift from it and show as a seam.
    <div data-surface="dark" className="relative flex min-h-dvh w-full bg-background text-foreground lg:h-dvh lg:overflow-hidden">
      {/* Phones/tablets: the key art as a header, fading into the panel. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[38vh] min-h-[240px] overflow-hidden lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
        <img src="/auth-hero.jpg" alt="" className="h-full w-full object-cover object-[50%_18%]" />
        {/* Reaches solid well before the edge, so there's no seam where the panel starts. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, color-mix(in srgb, var(--background) 5%, transparent) 0%, color-mix(in srgb, var(--background) 50%, transparent) 50%, var(--background) 88%)",
          }}
        />
      </div>

      <div className="relative z-10 flex w-full flex-col lg:h-dvh lg:w-[540px] lg:shrink-0 lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-white/[0.06] xl:w-[580px]">
        <header className="flex items-center justify-between px-6 pt-5 sm:px-10 lg:px-14 lg:pt-10">
          <Link href="/" className="hidden lg:block" aria-label="Circuit home">
            {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset */}
            <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-10 w-auto" />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-[13px] font-medium text-white/80 backdrop-blur-sm transition hover:text-white lg:bg-transparent lg:px-0 lg:text-muted lg:backdrop-blur-none lg:hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back to Circuit
          </Link>
        </header>

        {/* Phones: starts just under the art header (the switch overlaps its
            faded bottom edge); lg+: vertically centred beside the art. */}
        <main className="flex flex-1 flex-col px-6 pt-[max(180px,calc(38vh-64px))] pb-10 sm:px-10 lg:justify-center lg:px-14 lg:py-12">
          <div className="motion-slide-up w-full max-w-[400px] sm:mx-auto lg:mx-0">{children}</div>
        </main>

        <footer className="px-6 pb-6 text-[11px] text-muted-strong sm:px-10 sm:text-center lg:px-14 lg:pb-8 lg:text-left">
          © {year} Circuit · Tournaments, 1v1 challenges and real prizes.
        </footer>
      </div>

      {/* lg+: the key art, blended into the panel's edge. */}
      <aside className="relative hidden flex-1 overflow-hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset */}
        <img src="/auth-hero.jpg" alt="Circuit — more than a game" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-background to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 to-transparent" />
        {stats.length > 0 && (
          <dl className="absolute right-10 bottom-9 left-16 flex flex-wrap gap-x-8 gap-y-3">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col">
                <dt className="order-2 font-mono text-[10px] font-semibold tracking-[0.16em] text-white/60 uppercase">{s.label}</dt>
                <dd className="order-1 flex items-center gap-2 font-display text-3xl font-bold tracking-tight text-white">
                  {s.live && <span className="h-2 w-2 animate-pulse rounded-full bg-live" aria-hidden />}
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </aside>
    </div>
  );
}
