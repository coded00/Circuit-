/**
 * Circuit — "Connect your accounts" row. UI shell only, disabled — no
 * OAuth exists, that needs real developer credentials per platform this
 * environment doesn't have. Shared between the homepage and /account.
 */

import { Gamepad2, Link2 } from "lucide-react";

const PLATFORMS = [
  { name: "PlayStation", color: "#0f4fa8" },
  { name: "Xbox", color: "#107C10" },
  { name: "Steam", color: "#1b2838" },
  { name: "Epic Games", color: "#2a2a2a" },
  { name: "EA", color: "#4a4a4a" },
  { name: "Call of Duty", color: "#5a1f1f" },
  { name: "Nintendo", color: "#c8102e" },
];

export function ConnectAccountsRow() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-section-heading flex items-center gap-2">
        <Link2 size={17} className="text-brand-blue" />
        Connect Your Accounts
      </h2>
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((platform) => (
          <button
            key={platform.name}
            type="button"
            disabled
            title={`${platform.name} — coming soon`}
            className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-elevated py-2 pr-3.5 pl-2 text-sm font-medium text-muted transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full"
              style={{ backgroundColor: platform.color }}
            >
              <Gamepad2 size={13} className="text-white" />
            </span>
            {platform.name}
          </button>
        ))}
      </div>
    </div>
  );
}
