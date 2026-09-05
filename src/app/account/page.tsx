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
      <AccountForm
        initialDisplayName={user.displayName}
        initialAvatarUrl={user.avatarUrl ?? ""}
        initialPayoutMethodRef={user.payoutMethodRef ?? ""}
        initialDateOfBirth={user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : ""}
      />
    </div>
  );
}
