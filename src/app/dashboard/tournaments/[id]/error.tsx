"use client";

/**
 * Circuit — dedicated error boundary for an organizer's own tournament
 * detail panel. V1 audit follow-up: this page shows real money (entry
 * fees collected, organizer revenue, prize payout status) and previously
 * fell through to the generic root boundary on a failed load.
 */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";

export default function DashboardTournamentDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "error-boundary:dashboard/tournaments/[id]", digest: error.digest });
  }, [error]);

  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <AlertTriangle size={22} />
      </div>
      <h1 className="state-title">Couldn&apos;t load this tournament</h1>
      <p className="state-description">
        Your tournament&apos;s detail page failed to load — retry, or check back shortly. Nothing was changed.
      </p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
