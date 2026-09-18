import { Gamepad2 } from "lucide-react";

/** Circuit-style loading state (spec section 20) — reuses the existing
 *  `.skeleton` pulse utility rather than a bespoke shimmer. */
export function FeedSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <div className="relative h-full w-full overflow-hidden sm:aspect-[9/16] sm:h-full sm:w-auto">
        <div className="skeleton absolute inset-0 rounded-none" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Gamepad2 size={40} className="animate-pulse text-muted" />
        </div>
      </div>
    </div>
  );
}
