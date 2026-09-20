"use client";

/**
 * Circuit — dedicated error boundary for the Admin Overview landing page.
 * V1 audit follow-up: previously fell through to the generic root
 * error.tsx like any other page, despite being the first thing every
 * admin sees and running 10 parallel real-money/user-count queries.
 */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";

export default function AdminOverviewError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "error-boundary:admin", digest: error.digest });
  }, [error]);

  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <AlertTriangle size={22} />
      </div>
      <h1 className="state-title">Couldn&apos;t load the admin overview</h1>
      <p className="state-description">
        The dashboard numbers failed to load — retry, or check back shortly. Nothing was changed; this is a read
        failure, not a write.
      </p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
