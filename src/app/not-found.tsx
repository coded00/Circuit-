/**
 * Circuit — real 404 page. Every not-found route in the app reaches this
 * via Next's default notFound() handling (bad tournament id, deleted
 * player handle, etc.) — before this file existed, those all fell through
 * to Next's unstyled default 404, the only unbranded page left in the app.
 * Reuses the same .state-block language ComingSoon/callback pages already
 * use elsewhere, not a one-off design.
 */

import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="state-block motion-fade-in">
      <div className="state-icon">
        <Compass size={22} />
      </div>
      <h1 className="state-title">Page not found</h1>
      <p className="state-description">
        Whatever you were looking for isn&apos;t here — it may have been moved, or the link might be wrong.
      </p>
      <Link href="/" className="btn-secondary">
        Back to Circuit
      </Link>
    </div>
  );
}
