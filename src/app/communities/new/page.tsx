/** Circuit — start a player community. */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { loginPath } from "@/lib/safeRedirect";
import { MAX_OWNED_COMMUNITIES } from "@/lib/communityRules";
import { CommunityForm } from "@/components/community/CommunityForm";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";

export const metadata: Metadata = { title: "Create a community", robots: { index: false, follow: false } };

export default async function NewCommunityPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath("/communities/new"));

  const [games, owned] = await Promise.all([
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.community.count({ where: { ownerId: user.id, kind: "PLAYER", enabled: true } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/communities" className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft size={15} /> Communities
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[28px] leading-[0.95] font-bold tracking-tight sm:text-[36px]">Start a community</h1>
        <p className="text-[15px] text-muted">For your campus, your city, your crew or your game. You&apos;ll be the owner. You can add moderators later.</p>
      </header>
      {!user.emailVerifiedAt && !user.isStaff ? (
        <EmailVerificationBanner
          email={user.email ?? user.emailOrPhone}
          reason="Communities can only be created by verified accounts. It keeps spam and fake communities out. Verify your email to continue."
        />
      ) : owned >= MAX_OWNED_COMMUNITIES ? (
        <p className="cut-sm [--cut-line:var(--border)] border border-border bg-surface px-4 py-4 text-sm text-muted">
          You already own {owned} communities — the most one account can run. Close one or hand it to someone else to start another.
        </p>
      ) : (
        <CommunityForm mode="create" games={games} initial={{ region: user.region ?? "" }} />
      )}
    </div>
  );
}
