import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { sessionCookie } from "@/lib/auth";
import { safeNextPath } from "@/lib/safeRedirect";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthModeSwitch } from "@/components/auth/AuthModeSwitch";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { isGoogleSignInEnabled } from "@/lib/oauth/google";
import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  // Already signed in: this page has nothing to offer, so continue to
  // wherever they were headed (redirect() replaces the history entry).
  if (await getCurrentUser()) {
    const { next } = await searchParams;
    redirect(safeNextPath(typeof next === "string" ? next : null));
  }
  // A session cookie is still here but no longer valid: it expired (or was
  // revoked), as opposed to someone who was never signed in.
  const sessionExpired = (await cookies()).has(sessionCookie.name);

  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-7">
        <Suspense>
          <AuthModeSwitch active="login" />
        </Suspense>
        <AuthHeading eyebrow="Log in" title="Back in the game" sub="Your tournaments, challenges and wallet are right where you left them." />
        {sessionExpired && (
          <p role="status" className="rounded-[11px] border border-warning/30 bg-warning/[0.12] px-3.5 py-3 text-sm leading-relaxed text-foreground">
            Your session expired. Log in again to pick up where you left off.
          </p>
        )}
        <Suspense>
          <AuthMethods from="login" googleEnabled={isGoogleSignInEnabled()}>
            <LoginForm />
          </AuthMethods>
        </Suspense>
      </div>
    </AuthSplitLayout>
  );
}
