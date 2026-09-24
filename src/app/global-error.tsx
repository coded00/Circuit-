"use client";

/**
 * Circuit — catches a crash in the root layout itself (its own data
 * fetching, a provider throwing, etc.) — the one case error.tsx can't
 * catch, since that boundary lives INSIDE the layout this replaces.
 * Next.js requires this file to render its own <html>/<body> and pull
 * in its own styles — nothing from layout.tsx applies here, since this
 * only ever renders once that layout has already failed to render.
 */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";
import "./globals.css";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "global-error-boundary", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-full">
        <div className="state-block motion-fade-in" style={{ minHeight: "100dvh" }}>
          <div className="state-icon">
            <AlertTriangle size={22} />
          </div>
          <h1 className="state-title">Something went wrong</h1>
          <p className="state-description">Circuit hit a snag loading the page shell itself — try again in a moment.</p>
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
