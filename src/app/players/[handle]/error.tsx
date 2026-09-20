"use client";

/**
 * Circuit — dedicated error boundary for the public player profile.
 * V1 audit follow-up: the most-linked page in the app previously fell
 * through to the generic root boundary on any of its 13 queries failing.
 */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";

export default function PlayerProfileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "error-boundary:players/[handle]", digest: error.digest });
  }, [error]);

  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <AlertTriangle size={22} />
      </div>
      <h1 className="state-title">Couldn&apos;t load this profile</h1>
      <p className="state-description">Something failed loading this player&apos;s profile — try again.</p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
