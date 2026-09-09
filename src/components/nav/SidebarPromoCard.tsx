import Link from "next/link";

/**
 * Circuit — sidebar promotional card. Deliberately stays on the dark
 * surface (`data-surface="dark"`) as a bold accent card popping against
 * the now-light sidebar around it, rather than blending in. Flat dark
 * gradient only, no radial "glow blob" and no button glow — "subtle
 * abstract graphics," not neon, per the refined visual system's explicit
 * anti-glow rule.
 */
export function SidebarPromoCard() {
  return (
    <div
      data-surface="dark"
      className="flex flex-col gap-2.5 overflow-hidden rounded-[15px] border border-border p-4"
      style={{ backgroundImage: "linear-gradient(160deg, #181c22, #101318 70%, #0b0d11)" }}
    >
      <span className="font-display text-lg leading-[1.05] font-bold text-foreground uppercase">
        Play.
        <br />
        Connect.
        <br />
        Compete.
      </span>
      <span className="text-xs text-muted">Your world of gaming, connected.</span>
      <Link href="/signup" className="btn-secondary mt-1 w-full text-xs">
        Enter Circuit
      </Link>
    </div>
  );
}
