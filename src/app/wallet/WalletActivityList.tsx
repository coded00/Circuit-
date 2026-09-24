"use client";

/**
 * Circuit — wallet activity: one statement for everything that moved
 * money (top-ups, withdrawals, entry fees, stakes, payouts, refunds),
 * grouped by day, newest first, with a simple All / Top-ups & withdrawals
 * / Competitions filter. Entries arrive pre-built from page.tsx.
 */

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, RotateCcw, Swords, Trophy, Ticket } from "lucide-react";
import { Panel, PanelEmpty } from "@/components/ui/Panel";

export type WalletEntryKind = "FUND" | "WITHDRAWAL" | "ENTRY_FEE" | "REFUND" | "PRIZE_PAYOUT" | "STAKE" | "STAKE_PAYOUT";

export type WalletEntry = {
  id: string;
  at: string; // ISO
  kind: WalletEntryKind;
  title: string;
  subtitle: string;
  amount: number; // kobo, always positive
  credit: boolean;
  status: "COMPLETE" | "PENDING" | "FAILED";
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "cash", label: "Top-ups & withdrawals" },
  { key: "compete", label: "Competitions" },
] as const;

const ICON: Record<WalletEntryKind, { Icon: typeof Trophy; className: string }> = {
  FUND: { Icon: ArrowDownLeft, className: "bg-success/15 text-success" },
  WITHDRAWAL: { Icon: ArrowUpRight, className: "bg-surface-elevated text-foreground" },
  ENTRY_FEE: { Icon: Ticket, className: "bg-accent-blue-soft text-accent-blue" },
  REFUND: { Icon: RotateCcw, className: "bg-surface-elevated text-muted" },
  PRIZE_PAYOUT: { Icon: Trophy, className: "bg-gold/15 text-gold" },
  STAKE: { Icon: Swords, className: "bg-accent-orange-soft text-accent-orange" },
  STAKE_PAYOUT: { Icon: Trophy, className: "bg-gold/15 text-gold" },
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

// Pinned to Circuit's own locale zone so server and client agree (this
// component is server-rendered first) — same reasoning as CommunityView.
const TZ = "Africa/Lagos";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}

export function WalletActivityList({ entries }: { entries: WalletEntry[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const visible = entries.filter((e) =>
    filter === "all" ? true : filter === "cash" ? e.kind === "FUND" || e.kind === "WITHDRAWAL" : e.kind !== "FUND" && e.kind !== "WITHDRAWAL"
  );

  const groups: { label: string; items: WalletEntry[] }[] = [];
  for (const entry of visible) {
    const label = dayLabel(entry.at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }

  return (
    <Panel title="Activity" meta={entries.length || undefined}>
      <div className="scrollbar-hide flex gap-1.5 overflow-x-auto border-t border-border px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.key ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <PanelEmpty>
          {entries.length === 0
            ? "Nothing yet. Top-ups, entry fees, stakes and winnings will show up here."
            : "Nothing in this view yet."}
        </PanelEmpty>
      ) : (
        groups.map((group) => (
          <div key={group.label}>
            <div className="border-t border-border bg-surface-elevated/40 px-5 py-1.5 text-eyebrow text-muted">{group.label}</div>
            <div className="divide-y divide-border border-t border-border">
              {group.items.map((e) => {
                const { Icon, className } = ICON[e.kind];
                return (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${className}`}>
                      <Icon size={16} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{e.title}</span>
                      <span className="text-metadata truncate">{e.subtitle}</span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span
                        className={`text-stat text-sm ${e.status === "FAILED" ? "text-muted line-through" : e.credit ? "text-success" : "text-foreground"}`}
                      >
                        {e.credit ? "+" : "−"}
                        {formatNaira(e.amount)}
                      </span>
                      {e.status !== "COMPLETE" && (
                        <span className={`text-[11px] font-medium ${e.status === "FAILED" ? "text-danger" : "text-warning"}`}>
                          {e.status === "FAILED" ? "Failed" : "Processing"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}
