"use client";

/**
 * Circuit — dedicated error boundary for /dashboard/payouts (an
 * organizer's own read-only escrow visibility across every tournament
 * they run) — same reasoning as admin/finance's own error.tsx: a failed
 * load here is about real money and deserves more than the generic
 * root fallback.
 */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";

export default function DashboardPayoutsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "error-boundary:dashboard/payouts", digest: error.digest });
  }, [error]);

  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <AlertTriangle size={22} />
      </div>
      <h1 className="state-title">Couldn&apos;t load your payouts</h1>
      <p className="state-description">
        This page&apos;s numbers failed to load — retry, or check back shortly. Nothing was changed; this is a read
        failure, not a write.
      </p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
