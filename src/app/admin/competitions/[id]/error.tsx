"use client";

/**
 * Circuit — dedicated error boundary for the admin tournament detail/
 * manage page. V1 audit follow-up: money-critical controls (freeze
 * funds, cancel) live here; a failed load previously showed the same
 * generic message any other page would.
 */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";

export default function AdminCompetitionDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "error-boundary:admin/competitions/[id]", digest: error.digest });
  }, [error]);

  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <AlertTriangle size={22} />
      </div>
      <h1 className="state-title">Couldn&apos;t load this competition</h1>
      <p className="state-description">
        This tournament&apos;s admin detail page failed to load — retry, or check back shortly. Nothing was changed.
      </p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
