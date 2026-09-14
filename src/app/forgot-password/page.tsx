import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthSplitLayout>
      <div className="card flex w-full flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
          <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-12 w-auto max-w-none lg:hidden" />
          <div className="flex flex-col gap-1">
            <h1 className="text-section-heading">Reset your password</h1>
            <p className="text-sm text-muted">We&apos;ll email you a link to get back in.</p>
          </div>
        </div>
        <ForgotPasswordForm />
      </div>
    </AuthSplitLayout>
  );
}
