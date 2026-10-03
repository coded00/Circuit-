"use client";

/**
 * Circuit — the "Battle Request" card, shared by the global incoming-
 * challenge modal (QuickMatchIncomingListener) and the dedicated
 * /quick-match/[id] page a recipient lands on from a notification link
 * instead of catching the live modal. Presentational + the accept/decline
 * calls themselves; no polling of its own.
 */

import { useEffect, useState } from "react";
import { Swords } from "lucide-react";
import { Spinner } from "@/components/Spinner";

export type QuickMatchChallengeInfo = {
  id: string;
  game: string;
  format: string;
  stakeAmount: number;
  expiresAt: string;
  hostDisplayName: string;
  hostHandle: string;
};

function formatNaira(kobo: number): string {
  return kobo > 0 ? `₦${(kobo / 100).toLocaleString("en-NG")}` : "Free";
}

function formatFormat(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

function useCountdown(expiresAtIso: string): number {
  const [remainingMs, setRemainingMs] = useState(() => new Date(expiresAtIso).getTime() - Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(new Date(expiresAtIso).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAtIso]);
  return Math.max(0, remainingMs);
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  return `00:${String(totalSeconds).padStart(2, "0")}`;
}

export function QuickMatchChallengeCard({
  challenge,
  onAccept,
  onDecline,
  framed = true,
}: {
  challenge: QuickMatchChallengeInfo;
  onAccept: () => Promise<void>;
  onDecline?: () => Promise<void>;
  /** False when a parent (the incoming-request dialog) already supplies the surface and edge. */
  framed?: boolean;
}) {
  const remainingMs = useCountdown(challenge.expiresAt);
  // The window's full length isn't stored, so the drain bar measures
  // against whatever was left when this card first appeared.
  const [windowMs] = useState(() => Math.max(1, new Date(challenge.expiresAt).getTime() - Date.now()));
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);
  const expired = remainingMs <= 0;
  const urgent = !expired && remainingMs < 10_000;

  async function handleAccept() {
    setSubmitting("accept");
    await onAccept();
    setSubmitting(null);
  }

  async function handleDecline() {
    if (!onDecline) return;
    setSubmitting("decline");
    await onDecline();
    setSubmitting(null);
  }

  return (
    <div className={`flex flex-col overflow-hidden ${framed ? "cut-lg [--cut-line:var(--border)] border border-border bg-surface" : ""}`}>
      <div data-surface="dark" className="relative flex items-center gap-3.5 px-5 pt-5 pb-4">
        <span className="font-display flex h-12 w-12 shrink-0 items-center justify-center cut-sm bg-accent-volt text-lg font-bold text-accent-volt-foreground">
          {challenge.hostDisplayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.16em] text-accent-volt uppercase">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-volt" aria-hidden />
            <Swords size={11} /> Battle request
          </span>
          <p className="truncate font-display text-base font-bold tracking-tight">{challenge.hostDisplayName}</p>
          <p className="truncate text-xs text-muted">@{challenge.hostHandle} wants to play you</p>
        </div>
        <span className={`font-mono text-2xl font-semibold tabular-nums ${urgent ? "text-live" : "text-foreground"}`}>
          {expired ? "--" : formatCountdown(remainingMs).slice(3)}
          <span className="ml-0.5 text-xs text-muted">s</span>
        </span>
        <span
          aria-hidden
          className={`absolute bottom-0 left-0 h-[3px] transition-[width] duration-1000 ease-linear ${urgent ? "bg-live" : "bg-accent-volt"}`}
          style={{ width: `${Math.min(100, (remainingMs / windowMs) * 100)}%` }}
        />
      </div>

      <dl className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {[
          ["Game", challenge.game],
          ["Format", formatFormat(challenge.format)],
          ["Entry", formatNaira(challenge.stakeAmount)],
        ].map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
            <dt className="font-mono text-[10px] tracking-[0.12em] text-muted-strong uppercase">{label}</dt>
            <dd className="truncate text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3 px-5 py-4">
        {expired ? (
          <p className="text-sm text-danger">This request has expired.</p>
        ) : (
          <div className="flex gap-2">
            {onDecline && (
              <button type="button" onClick={handleDecline} disabled={!!submitting} className="btn-secondary">
                {submitting === "decline" ? "Declining…" : "Decline"}
              </button>
            )}
            <button type="button" onClick={handleAccept} disabled={!!submitting} className="btn-primary flex-1">
              {submitting === "accept" && <Spinner />}
              {submitting === "accept" ? "Accepting…" : "Accept battle"}
            </button>
          </div>
        )}
        <p className="text-metadata">First player to accept gets the battle.</p>
      </div>
    </div>
  );
}
