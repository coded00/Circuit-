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
import { getCurrentUser } from "@/lib/session";
import { safeNextPath } from "@/lib/safeRedirect";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { PENDING_COOKIE, readPendingCookie } from "@/lib/oauth/flowCookies";
import { suggestHandle } from "@/lib/oauth/accounts";
import CompleteGoogleSignupForm from "./CompleteGoogleSignupForm";

export const metadata: Metadata = { title: "Finish setting up", robots: { index: false, follow: false } };

export default async function CompleteGoogleSignupPage() {
  const pending = await readPendingCookie((await cookies()).get(PENDING_COOKIE)?.value);
  // Already signed in (e.g. finished this step in another tab): nothing left to do here.
  if (await getCurrentUser()) redirect(safeNextPath(pending?.next));
  if (!pending || pending.kind !== "new") redirect("/signup?error=google_expired");

  const [suggestedHandle, games] = await Promise.all([
    suggestHandle(pending.profile),
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-7">
        <AuthHeading eyebrow="Almost there" title="Pick your tag" sub="This is how other players will see you on Circuit." />
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
