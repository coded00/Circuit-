import { Suspense } from "react";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { isGoogleSignInEnabled } from "@/lib/oauth/google";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <AuthSplitLayout>
      <div className="card flex w-full flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
          <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-12 w-auto max-w-none lg:hidden" />
          <div className="flex flex-col gap-1">
            <h1 className="text-section-heading">Create your Circuit account</h1>
            <p className="text-sm text-muted">No payment info needed. Start playing in seconds.</p>
          </div>
        </div>
        <Suspense>
          <AuthMethods from="signup" googleEnabled={isGoogleSignInEnabled()}>
            <SignupForm />
          </AuthMethods>
          <AuthSwitchLink to="login" />
        </Suspense>
      </div>
    </AuthSplitLayout>
  );
}
