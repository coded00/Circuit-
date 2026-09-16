import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ConnectAccountsRow } from "@/components/ConnectAccountsRow";
import AccountForm from "./AccountForm";

// Private, per-user settings — never real public content.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/account");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Account settings</h1>
        <p className="text-sm text-muted">@{user.handle}</p>
      </div>
      {user.isSuspended && (
        <div className="alert alert-danger">
          <p>
            Your account is suspended: {user.suspensionReason ?? "contact support."} You can&apos;t register,
            pay, or accept Battles while suspended.
          </p>
        </div>
      )}
      {!user.email && (
        <div className="alert alert-info">
          <p>Add your email below to get notified when new tournaments and Challenges go live.</p>
        </div>
      )}
      <AccountForm
        initialDisplayName={user.displayName}
        initialAvatarUrl={user.avatarUrl ?? ""}
        initialPayoutMethodRef={user.payoutMethodRef ?? ""}
        initialDateOfBirth={user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : ""}
        initialBio={user.bio ?? ""}
        initialFavoriteGames={user.favoriteGames}
        initialEmail={user.email ?? ""}
        initialNotifyNewContent={user.notifyNewContent}
        initialRegion={user.region ?? ""}
      />

      <div className="card flex flex-col gap-4">
        <ConnectAccountsRow />
        <p className="text-sm text-muted">
          Link your platform accounts to show your gamertag on your profile. Not available yet — needs
          developer credentials from each platform.
        </p>
      </div>
    </div>
  );
}
