/**
 * Circuit — the one-time profile step for someone signing up with Google.
 * Google supplied who they are (name, email, photo); Circuit still needs a
 * username and, optionally, their country and games. The account is only
 * created when they submit — nothing half-made is left if they leave.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { PENDING_COOKIE, readPendingCookie } from "@/lib/oauth/flowCookies";
import { suggestHandle } from "@/lib/oauth/accounts";
import CompleteGoogleSignupForm from "./CompleteGoogleSignupForm";

export const metadata: Metadata = { title: "Finish setting up", robots: { index: false, follow: false } };

export default async function CompleteGoogleSignupPage() {
  const pending = await readPendingCookie((await cookies()).get(PENDING_COOKIE)?.value);
  if (!pending || pending.kind !== "new") redirect("/signup?error=google_expired");

  const [suggestedHandle, games] = await Promise.all([
    suggestHandle(pending.profile),
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  return (
    <AuthSplitLayout>
      <div className="card flex w-full flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-section-heading">One last step</h1>
          <p className="text-sm text-muted">Pick how you&apos;ll show up on Circuit.</p>
        </div>
        <CompleteGoogleSignupForm
          email={pending.profile.email}
          googleName={pending.profile.name}
          googlePicture={pending.profile.picture}
          suggestedHandle={suggestedHandle}
          gameOptions={games.map((g) => g.name)}
        />
      </div>
    </AuthSplitLayout>
  );
}
