"use client";

/** Circuit — dedicated error boundary for /leaderboard. V1 audit follow-up. */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";

export default function LeaderboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "error-boundary:leaderboard", digest: error.digest });
  }, [error]);

  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <AlertTriangle size={22} />
      </div>
      <h1 className="state-title">Couldn&apos;t load the leaderboard</h1>
      <p className="state-description">Standings failed to load — try again.</p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
