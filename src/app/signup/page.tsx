import { Suspense } from "react";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthModeSwitch } from "@/components/auth/AuthModeSwitch";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { isGoogleSignInEnabled } from "@/lib/oauth/google";
import SignupForm from "./SignupForm";

export default function SignupPage() {
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
