import { redirect } from "next/navigation";
import { Gamepad2 } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import AccountForm from "./AccountForm";

const PLATFORMS = ["PlayStation", "Xbox", "Steam", "Epic Games", "EA", "Call of Duty", "Nintendo"];

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/account");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="text-sm text-muted">@{user.handle}</p>
      </div>
      {user.isSuspended && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Your account is suspended: {user.suspensionReason ?? "contact support."} You can&apos;t register,
          pay, or accept Battles while suspended.
        </p>
      )}
      <AccountForm
        initialDisplayName={user.displayName}
        initialAvatarUrl={user.avatarUrl ?? ""}
        initialPayoutMethodRef={user.payoutMethodRef ?? ""}
        initialDateOfBirth={user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : ""}
      />

      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Connect your accounts</span>
          <span className="rounded-full bg-status-neutral/15 px-2 py-0.5 text-xs font-medium text-status-neutral">
            Coming soon
          </span>
        </div>
        <p className="text-xs text-muted">
          Link your platform accounts to show your gamertag on your profile. Not available yet — needs
          developer credentials from each platform.
        </p>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => (
            <button
              key={platform}
              type="button"
              disabled
              title="Coming soon"
              className="flex cursor-not-allowed items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-muted opacity-50"
            >
              <Gamepad2 size={14} />
              {platform}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
