"use client";

/**
 * Circuit — the host's Quick Match "Searching for an opponent..." screen.
 * Polls the challenge's own status (tighter than NotificationBell's 5s
 * poll — this is an active waiting moment, not a background badge) and
 * reacts to whichever terminal state it lands in. Reuses MatchFoundHud
 * verbatim for the accepted case — same "Match Found" moment as
 * registration's own success flow.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MatchFoundHud } from "@/components/MatchFoundHud";
import { Spinner } from "@/components/Spinner";

const POLL_INTERVAL_MS = 2500;

type Status = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  game: string;
  format: string;
  stakeAmount: number;
  expiresAt: string;
  battleId: string | null;
  recipientCount: number;
  respondedCount: number;
};

function formatNaira(kobo: number): string {
  return kobo > 0 ? `₦${(kobo / 100).toLocaleString("en-NG")}` : "Free";
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `00:${String(totalSeconds).padStart(2, "0")}`;
}

export function QuickMatchSearchingScreen({ challengeId, initial }: { challengeId: string; initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (status.status !== "PENDING") return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/quick-match/${challengeId}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setStatus(data);
      } catch {
        // Ignored — the next interval tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [challengeId, status.status]);

  useEffect(() => {
    if (status.status !== "PENDING") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [status.status]);

  async function handleCancel() {
    setCancelling(true);
    const res = await fetch(`/api/quick-match/${challengeId}/cancel`, { method: "POST" });
    if (res.ok) {
      setStatus((s) => ({ ...s, status: "CANCELLED" }));
    }
    setCancelling(false);
  }

  if (status.status === "ACCEPTED" && status.battleId) {
    return <MatchFoundHud onComplete={() => router.push(`/battles/${status.battleId}`)} />;
  }

  if (status.status === "EXPIRED") {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-card-title font-semibold">Challenge expired</p>
        <p className="text-sm text-muted">No opponent found in time.</p>
        <button type="button" onClick={() => router.push("/battles/new")} className="btn-primary">
          Find Another Match
        </button>
      </div>
    );
  }

  if (status.status === "CANCELLED") {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-card-title font-semibold">Search cancelled</p>
        <button type="button" onClick={() => router.push("/battles/new")} className="btn-primary">
          Find Another Match
        </button>
      </div>
    );
  }

  const remainingMs = Math.max(0, new Date(status.expiresAt).getTime() - now);

  return (
    <div className="card flex flex-col items-center gap-5 p-8 text-center">
      <Spinner />
      <p className="text-card-title font-semibold">Searching for an opponent…</p>
      <div className="flex w-full flex-col gap-1 rounded-[10px] border border-border bg-surface-elevated p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Game</span>
          <span className="font-medium">{status.game}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Entry</span>
          <span className="font-medium">{formatNaira(status.stakeAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Players notified</span>
          <span className="font-medium">{status.recipientCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Responses</span>
          <span className="font-medium">{status.respondedCount}</span>
        </div>
      </div>
      <span className="font-mono text-2xl font-semibold tabular-nums">{formatCountdown(remainingMs)}</span>
      <button type="button" onClick={handleCancel} disabled={cancelling} className="btn-secondary">
        {cancelling ? "Cancelling…" : "Cancel Search"}
      </button>
    </div>
  );
}
