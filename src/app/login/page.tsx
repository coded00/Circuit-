import { Suspense } from "react";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthModeSwitch } from "@/components/auth/AuthModeSwitch";
import { AuthMethods } from "@/components/auth/AuthMethods";
import { isGoogleSignInEnabled } from "@/lib/oauth/google";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-7">
        <Suspense>
          <AuthModeSwitch active="login" />
        </Suspense>
        <AuthHeading eyebrow="Log in" title="Back in the game" sub="Your tournaments, challenges and wallet are right where you left them." />
        <Suspense>
          <AuthMethods from="login" googleEnabled={isGoogleSignInEnabled()}>
            <LoginForm />
          </AuthMethods>
        </Suspense>
      </div>
    </AuthSplitLayout>
  );
}
