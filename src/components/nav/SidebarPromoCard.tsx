import Link from "next/link";
import { Gamepad2 } from "lucide-react";

/**
 * Circuit — sidebar promotional card. Its own dark gradient (a shade
 * richer than the rail's own dark background) is what gives it visual
 * weight now that the rail itself is dark too. Flat gradient + one glyph
 * only, no radial "glow blob" and no button glow — "subtle abstract
 * graphics," not neon, per the refined visual system's explicit
 * anti-glow rule.
 */
export function SidebarPromoCard() {
  return (
    <div
      data-surface="dark"
      className="relative flex flex-col gap-2.5 overflow-hidden rounded-[15px] border border-border p-4"
      style={{ backgroundImage: "linear-gradient(160deg, #181c22, #101318 70%, #0b0d11)" }}
    >
      <Gamepad2 size={72} className="absolute -right-3 -bottom-3 text-foreground/5" aria-hidden />
      <span className="font-display text-lg leading-[1.05] font-bold text-foreground uppercase">
        Play.
        <br />
        Connect.
        <br />
        Compete.
      </span>
      <span className="text-xs text-muted">Real tournaments, real opponents, real payouts.</span>
      <Link
        href="/signup"
        className="mt-1 flex w-full items-center justify-center gap-1 rounded-full border border-accent-volt py-2 text-xs font-semibold text-accent-volt transition hover:bg-accent-volt-soft"
      >
        Join the Circuit →
      </Link>
    </div>
  );
}
