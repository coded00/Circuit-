import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import AccountForm from "./AccountForm";

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
    </div>
  );
}
