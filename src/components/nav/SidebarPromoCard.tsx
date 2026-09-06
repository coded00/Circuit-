/**
 * Circuit — sidebar promo card (NEXA reference: a purple-gradient tagline
 * card pinned near the bottom of the sidebar). Reuses Circuit's own
 * homepage tagline rather than NEXA's "Play. Compete. Belong." copy.
 */
export function SidebarPromoCard() {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-4"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 200px 160px at 20% 0%, rgba(124,58,237,0.55), transparent 70%), linear-gradient(160deg, #1a0f24, #140f1f 60%, #0b0d10)",
      }}
    >
      <span className="text-sm leading-snug font-semibold text-white">
        Play.
        <br />
        Compete.
        <br />
        Get Paid.
      </span>
    </div>
  );
}
