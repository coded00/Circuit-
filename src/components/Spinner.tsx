import { Loader2 } from "lucide-react";

/**
 * A real "request in flight" indicator — every caller already has a
 * genuine `submitting` boolean from an in-progress fetch; this just gives
 * that state a visible icon instead of relying on the button's text label
 * alone. Presentational only, no state of its own.
 */
export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden />;
}
