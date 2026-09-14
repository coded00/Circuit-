import Link from "next/link";
import { Radio, LayoutDashboard, MoreHorizontal } from "lucide-react";

/**
 * Circuit — "Your Channel" right-rail widget (Phase 10 of the CIRCUIT UI
 * spec). Circuit has no streaming backend — no broadcast state, no
 * follower/view tracking, no "next stream" scheduling. Per explicit
 * product decision the follower/view/next-stream figures are static
 * illustrative values (the one deliberate fake-data exception, same as
 * LiveOnCircuit/CircuitHero).
 *
 * Status is hardcoded "Offline" rather than randomly "Live" — showing a
 * fake "Live" state would actively mislead a viewer into thinking
 * something is currently broadcasting, which is a step further than
 * "illustrative numbers" and not something the fabricated-data exception
 * was meant to cover. Go Live / Stream Dashboard are real disabled
 * controls (same pattern as the top bar's Go Live button), not fake
 * working buttons.
 */

type ChannelUser = { displayName: string; avatarUrl: string | null };

export function YourChannel({ user }: { user: ChannelUser }) {
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-section-heading">Your Channel</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-full bg-muted-strong" aria-hidden />
          Offline
        </span>
      </div>

      <div className="flex items-center gap-3">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
          <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full border-2 border-accent-blue/50 object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-accent-blue/50 bg-surface-elevated text-lg font-semibold text-muted">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="truncate font-semibold">{user.displayName}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col">
          <span className="text-stat text-base">12,840</span>
          <span className="text-metadata">Followers</span>
        </div>
        <div className="flex flex-col">
          <span className="text-stat text-base">1.2M</span>
          <span className="text-metadata">Total Views</span>
        </div>
        <div className="flex flex-col">
          <span className="text-stat text-[13px]">Today, 8:00 PM</span>
          <span className="text-metadata">Next Stream</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" disabled title="Live streaming — coming soon" className="btn-golive flex-1 justify-center text-xs">
          <Radio size={13} className="text-live" />
          Go Live
        </button>
        <button
          type="button"
          disabled
          title="Stream dashboard — coming soon"
          className="btn-secondary flex-1 justify-center gap-1.5 px-3 py-2 text-xs"
        >
          <LayoutDashboard size={13} />
          Dashboard
        </button>
        <Link href="/account" className="btn-icon shrink-0" aria-label="Channel settings">
          <MoreHorizontal size={16} />
        </Link>
      </div>
    </div>
  );
}
