/**
 * Circuit — "You already have a Circuit account". Reached when someone
 * continues with Google and a Circuit account already uses that email.
 * They confirm that account's password once and Google is linked to it —
 * same account, same data; no second account is created. See
 * src/lib/oauth/accounts.ts for why this isn't automatic.
 */

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { PENDING_COOKIE, readPendingCookie } from "@/lib/oauth/flowCookies";
import LinkGoogleForm from "./LinkGoogleForm";

export const metadata: Metadata = { title: "Link your Google account", robots: { index: false, follow: false } };

export default async function LinkGooglePage() {
  const pending = await readPendingCookie((await cookies()).get(PENDING_COOKIE)?.value);
  if (!pending || pending.kind !== "link") redirect("/login?error=google_expired");

  const user = await prisma.user.findUnique({ where: { id: pending.userId }, select: { handle: true, displayName: true, avatarUrl: true } });
  if (!user) redirect("/login?error=google_expired");

  return (
    <AuthSplitLayout>
      <div className="card flex w-full flex-col gap-6">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-section-heading">You already have an account</h1>
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{pending.profile.email}</span> is already on Circuit. Confirm your password once to
            sign in with Google from now on. Your profile, competitions and wallet stay exactly as they are.
          </p>
        </div>
        <LinkGoogleForm handle={user.handle} displayName={user.displayName} avatarUrl={user.avatarUrl} />
      </div>
    </AuthSplitLayout>
  );
}
