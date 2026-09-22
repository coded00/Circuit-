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
}: {
  challenge: QuickMatchChallengeInfo;
  onAccept: () => Promise<void>;
  onDecline?: () => Promise<void>;
}) {
  const remainingMs = useCountdown(challenge.expiresAt);
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);

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
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-accent-blue">
          <Swords size={18} />
        </span>
        <div>
          <p className="text-card-title font-semibold">Battle Request</p>
          <p className="text-sm text-muted">
            {challenge.hostDisplayName} (@{challenge.hostHandle}) wants to battle you
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-[10px] border border-border bg-surface-elevated p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Game</span>
          <span className="font-medium">{challenge.game}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Format</span>
          <span className="font-medium">{formatFormat(challenge.format)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Entry</span>
          <span className="font-medium">{formatNaira(challenge.stakeAmount)}</span>
        </div>
      </div>

      <p className="text-metadata">First player to accept gets the battle.</p>

      {remainingMs <= 0 ? (
        <p className="field-error">This challenge has expired.</p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-sm text-muted">{formatCountdown(remainingMs)}</span>
          <div className="flex gap-2">
            {onDecline && (
              <button type="button" onClick={handleDecline} disabled={!!submitting} className="btn-secondary">
                {submitting === "decline" ? "Declining…" : "Decline"}
              </button>
            )}
            <button type="button" onClick={handleAccept} disabled={!!submitting} className="btn-primary">
              {submitting && <Spinner />}
              {submitting === "accept" ? "Accepting…" : "Accept"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
