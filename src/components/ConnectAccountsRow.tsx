/**
 * Circuit — "Connect your accounts" row (NEXA reference: circular platform
 * icon buttons under the hero). UI shell only, disabled — no OAuth exists,
 * that needs real developer credentials per platform this environment
 * doesn't have. Shared between the homepage and /account so the visual
 * treatment never drifts between the two places it appears.
 */

import { Gamepad2, Link2, MoreHorizontal } from "lucide-react";

const PLATFORMS = [
  { name: "PlayStation", color: "#0f4fa8" },
  { name: "Xbox", color: "#107C10" },
  { name: "Steam", color: "#1b2838" },
  { name: "Epic Games", color: "#2a2a2a" },
  { name: "Riot Games", color: "#c8202e" },
  { name: "Call of Duty", color: "#5a1f1f" },
  { name: "EA", color: "#4a4a4a" },
  { name: "Nintendo", color: "#c8102e" },
];

export function ConnectAccountsRow() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Link2 size={17} className="text-muted" />
        Connect Your Accounts
      </h2>
      <div className="flex flex-wrap gap-4">
        {PLATFORMS.map((platform) => (
          <button
            key={platform.name}
            type="button"
            disabled
            title={`${platform.name} — coming soon`}
            className="flex cursor-not-allowed flex-col items-center gap-1.5 opacity-60"
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: platform.color }}
            >
              <Gamepad2 size={20} className="text-white" />
            </span>
            <span className="text-[10px] text-muted">{platform.name}</span>
          </button>
        ))}
        <button
          type="button"
          disabled
          title="More platforms — coming soon"
          className="flex cursor-not-allowed flex-col items-center gap-1.5 opacity-60"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-surface-hover">
            <MoreHorizontal size={20} className="text-muted" />
          </span>
          <span className="text-[10px] text-muted">More</span>
        </button>
      </div>
    </div>
  );
}
