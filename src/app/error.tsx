"use client";

/**
 * Circuit — the root error boundary (Next.js's per-segment error.tsx
 * convention). Catches a client-render crash anywhere under the root
 * layout and shows this instead of Next's default unbranded overlay
 * (dev) or a blank page (production) — same .state-block language
 * not-found.tsx already uses, not a one-off design.
 *
 * Runs inside the root layout, so nav/sidebar stay visible — only the
 * page content itself is replaced. A crash in the root layout itself
 * (its own data fetching, not a child page) isn't caught here; that's
 * global-error.tsx's job instead, since the layout that renders this
 * boundary is itself gone at that point.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/observability";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    captureException(error, { source: "error-boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <AlertTriangle size={22} />
      </div>
      <h1 className="state-title">Something went wrong</h1>
      <p className="state-description">
        That&apos;s on us, not you — try again, or head back to Circuit if it keeps happening.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Back to Circuit
        </Link>
      </div>
    </div>
  );
}
