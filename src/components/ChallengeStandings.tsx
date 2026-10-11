"use client";

import { useState } from "react";
import Link from "next/link";

export type StandingRowView = { rank: number; name: string; handle: string; value: string; winner: boolean; prize: string | null; me: boolean };
export type StandingBoardView = { key: string; name: string; /** What the prize is, e.g. "₦5,000"; null for the overall board. */ prize: string | null; metricLabel: string; combined: boolean; rows: StandingRowView[] };

/**
 * Circuit — the leaderboards of a finished or provisional challenge: the overall board and one per prize category, switched
 * with tabs. Each shows who is eligible for that prize, how they rank by its metric, and who holds it. Only players whose
 * scores staff verified appear.
 */
export function ChallengeStandings({ boards }: { boards: StandingBoardView[] }) {
  const [active, setActive] = useState(boards[0]?.key ?? "");
  const board = boards.find((b) => b.key === active) ?? boards[0];
  if (!board) return null;

  return (
    <div className="flex flex-col gap-3">
      {boards.length > 1 && (
        <div role="tablist" aria-label="Leaderboards" className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {boards.map((b) => (
            <button
              key={b.key}
              type="button"
              role="tab"
              aria-selected={b.key === board.key}
              onClick={() => setActive(b.key)}
              className={`cut-xs shrink-0 px-3 py-1.5 text-[13px] font-medium ${b.key === board.key ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"}`}
            >
              {b.name}
              {b.prize ? <span className="ml-1.5 font-mono text-[11px] opacity-70">{b.prize}</span> : null}
            </button>
          ))}
        </div>
      )}

      {board.combined && <p className="text-xs text-muted">A combined prize — paid to the player who wins every prize it combines, instead of those separate prizes.</p>}

      {board.rows.length === 0 ? (
        <p className="text-sm text-muted">{board.combined ? "Nobody won every prize this combines, so it wasn't awarded." : "Nobody qualified for this one."}</p>
      ) : (
        <div className="overflow-hidden border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-xs text-muted uppercase">
              <tr>
                <th className="w-12 px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Player</th>
                <th className="px-3 py-2 text-right font-medium">{board.metricLabel}</th>
                <th className="px-3 py-2 text-right font-medium">Prize</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {board.rows.map((r) => (
                <tr key={`${r.handle}-${r.rank}`} className={r.me ? "bg-accent-volt/10" : undefined}>
                  <td className="px-3 py-2 font-mono tabular-nums">{r.rank}</td>
                  <td className="px-3 py-2">
                    <Link href={`/players/${r.handle}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    {r.me && <span className="ml-2 text-xs text-accent-volt">You</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{r.value}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gold tabular-nums">{r.prize ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
