import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { safeNextPath } from "@/lib/safeRedirect";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthModeSwitch } from "@/components/auth/AuthModeSwitch";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { isGoogleSignInEnabled } from "@/lib/oauth/google";
import SignupForm from "./SignupForm";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  // Already signed in: this page has nothing to offer, so continue to
  // wherever they were headed (redirect() replaces the history entry).
  if (await getCurrentUser()) {
    const { next } = await searchParams;
    redirect(safeNextPath(typeof next === "string" ? next : null));
  }

  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-7">
        <Suspense>
          <AuthModeSwitch active="signup" />
        </Suspense>
        <AuthHeading eyebrow="Create account" title="Join the Circuit" sub="Enter tournaments, call out rivals, win real prizes. Free to join." />
        <Suspense>
          <AuthMethods from="signup" googleEnabled={isGoogleSignInEnabled()}>
            <SignupForm />
          </AuthMethods>
        </Suspense>
      </div>
    </AuthSplitLayout>
  );
}
