import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
import { prisma } from "@/lib/db";
import { isGoogleSignInEnabled } from "@/lib/oauth/google";
import { getCurrentUser } from "@/lib/session";
import { listBlocked } from "@/lib/blocks";
import { ConnectAccountsRow } from "@/components/ConnectAccountsRow";
import { CommunityTagPicker } from "@/components/community/CommunityTagPicker";
import { AppealForm } from "@/components/community/AppealForm";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { SectionTabs, type SectionTab } from "@/components/ui/SectionTabs";
import AccountForm from "./AccountForm";
import { SignInMethods } from "./SignInMethods";
import PrivacyForm from "./PrivacyForm";
import BlockedList from "./BlockedList";
import ChangePasswordForm from "./ChangePasswordForm";
import SignOutButton from "./SignOutButton";
import DeleteAccountCard from "./DeleteAccountCard";

// Private, per-user settings — never real public content.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath("/account"));
  }
  const { tab } = await searchParams;
  const [google, taggedCommunities, openAppeals, blocked] = await Promise.all([
    prisma.authIdentity.findUnique({
      where: { userId_provider: { userId: user.id, provider: "google" } },
      select: { email: true },
    }),
    prisma.community.findMany({
      where: { enabled: true, tag: { not: null }, members: { some: { userId: user.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, tag: true },
    }),
    prisma.appeal.count({ where: { userId: user.id, kind: "ACCOUNT_SUSPENSION", status: "OPEN" } }),
    listBlocked(user.id),
  ]);

  // Settings in sections, not one long stack: who you are, how you sign in,
  // who can reach you, who you've blocked, and the account itself.
  const tabs: SectionTab[] = [
    {
      key: "profile",
      label: "Profile",
      content: (
        <div className="flex flex-col gap-8">
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
          <CommunityTagPicker
            options={taggedCommunities.map((c) => ({ id: c.id, name: c.name ?? "Community", tag: c.tag! }))}
            current={user.featuredCommunityId}
          />
        </div>
      ),
    },
    {
      key: "security",
      label: "Security",
      content: (
        <div className="flex flex-col gap-6">
          <Suspense>
            <SignInMethods hasPassword={!!user.passwordHash} google={google} googleEnabled={isGoogleSignInEnabled()} />
          </Suspense>
          {user.passwordHash && <ChangePasswordForm />}
          <div className="card flex flex-col gap-4">
            <ConnectAccountsRow />
            <p className="text-sm text-muted">
              Link your platform accounts to show your gamertag on your profile. Not available yet — needs developer credentials from each platform.
            </p>
          </div>
          <SignOutButton />
        </div>
      ),
    },
    { key: "privacy", label: "Privacy", content: <PrivacyForm initialSearchable={user.searchable} initialPolicy={user.directChallenges} /> },
    { key: "blocked", label: "Blocked", count: blocked.length, content: <BlockedList blocked={blocked} /> },
    { key: "account", label: "Account", content: <DeleteAccountCard requestedAt={user.deletionRequestedAt?.toISOString() ?? null} /> },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Account settings</h1>
        <p className="text-sm text-muted">@{user.handle}</p>
      </div>
      {user.isSuspended && (
        <div className="alert alert-danger flex flex-col gap-3">
          <p>
            Your account is suspended: {user.suspensionReason ?? "contact support."} You can&apos;t register,
            pay, or accept Battles while suspended.
          </p>
          <AppealForm kind="ACCOUNT_SUSPENSION" pending={openAppeals > 0} />
        </div>
      )}
      {user.email && !user.emailVerifiedAt && <EmailVerificationBanner email={user.email} />}
      {!user.email && (
        <div className="alert alert-info">
          <p>Add your email below to get notified when new tournaments and Challenges go live.</p>
        </div>
      )}
      <SectionTabs tabs={tabs} initialTab={tab} label="Settings sections" idPrefix="settings" />
    </div>
  );
}
