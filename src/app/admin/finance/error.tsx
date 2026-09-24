"use client";

/**
 * Circuit — a dedicated error boundary for /admin/finance, not just the
 * generic root one (src/app/error.tsx). V1 audit follow-up: a fetch
 * failure on this specific page (multiple aggregate queries over real
 * money — see the page's own comment) previously showed the exact same
 * "Something went wrong" any other page would, giving an admin staring
 * at a failed finance load no more context than a broken link would.
 */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";

export default function AdminFinanceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "error-boundary:admin/finance", digest: error.digest });
  }, [error]);

  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <AlertTriangle size={22} />
      </div>
      <h1 className="state-title">Couldn&apos;t load finance data</h1>
      <p className="state-description">
        The revenue/wallet/escrow numbers on this page failed to load — retry, or check back shortly. Nothing was
        changed; this is a read failure, not a write.
      </p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </div>
  );
}
