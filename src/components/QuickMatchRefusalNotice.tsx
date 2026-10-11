"use client";

/**
 * Circuit — the panel both accept clients show when a Quick Match accept was
 * refused. Shared rather than written twice so the modal and the dedicated
 * page say the same thing in the same shape — see src/lib/quickMatchRefusal.ts
 * for where the words come from.
 *
 * The icon is the only thing that varies: a clock for a challenge that is
 * simply gone, a warning for one the player is blocked from taking. The
 * message is never truncated by this component — several of them ("verify your
 * email... and click it") are a full instruction, and the layout has to hold a
 * long one.
 */

import { AlertTriangle, Clock } from "lucide-react";
import type { AcceptRefusal } from "@/lib/quickMatchRefusal";

export function QuickMatchRefusalNotice({ refusal, onClose }: { refusal: AcceptRefusal; onClose?: () => void }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
      <div className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center cut-sm bg-surface-elevated text-muted">
          {refusal.gone ? <Clock size={20} /> : <AlertTriangle size={20} />}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-display text-[17px] font-bold tracking-tight">{refusal.title}</p>
          <p className="text-sm text-muted">{refusal.message}</p>
        </div>
      </div>
      {/* Only where there is somewhere to go back to. A refusal the player has
          to act on waits for them to close it (the modal has no other control
          once the request is answered); a page has its own navigation, and a
          button that only hides a card would just be a dead end. */}
      {onClose && (
        <button type="button" onClick={onClose} className="btn-secondary self-end">
          Close
        </button>
      )}
    </div>
  );
}
