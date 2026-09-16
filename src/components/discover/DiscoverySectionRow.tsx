/**
 * Circuit — Phase 4's "instead of one endless generic list" section
 * shell: a title plus a horizontal-scrolling row of cards. Reused for
 * every personalized section (players and teams) — the main filterable
 * grid below still supports plain vertical scrolling, per the spec's own
 * "each section can have a horizontal scroll... the main discovery page
 * supports vertical scrolling" instruction.
 */
export function DiscoverySectionRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-section-heading">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-1">{children}</div>
    </div>
  );
}
