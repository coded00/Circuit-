import Link from "next/link";
import { GameArtTile, gameTint } from "@/components/GameArtTile";
import { GAME_ACTIVITY } from "@/lib/circuitActivity";

/**
 * Circuit — "Circuit Pulse" right-rail widget (Phase 11 of the CIRCUIT UI
 * spec). Ranked by the same static illustrative activity figures
 * ExploreTheCircuit (Phase 8) uses — shared from one source (see
 * circuitActivity.ts) so the two sections never disagree with each other.
 */

const RANKED = [...GAME_ACTIVITY].sort(
  (a, b) => parseFloat(b.connected) - parseFloat(a.connected),
);

export function CircuitPulse() {
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-section-heading">Circuit Pulse</h2>
        <Link href="/ladder" className="text-xs font-medium text-brand-blue hover:underline">
          View All
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        {RANKED.map((g, i) => (
          <Link
            key={g.name}
            href={`/?game=${encodeURIComponent(g.name)}#discover`}
            className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition hover:bg-surface-elevated"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] font-mono text-xs font-semibold ${
                i < 3 ? "text-white" : "bg-surface-elevated text-muted"
              }`}
              style={i < 3 ? { backgroundColor: gameTint(g.name) } : undefined}
            >
              {i + 1}
            </span>
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[6px]">
              <GameArtTile game={g.name} className="h-full w-full" hideLabel />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{g.name}</span>
              <span className="text-metadata">{g.connected} connected</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
