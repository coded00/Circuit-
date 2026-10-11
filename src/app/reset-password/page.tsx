import { Suspense } from "react";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthHeading } from "@/components/auth/AuthHeading";
import ResetPasswordForm from "./ResetPasswordForm";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Reset Password",
  description:
    "Choose a new Circuit password.",
  path: "/reset-password",
  noindex: true,
});


export default function ResetPasswordPage() {
  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-7">
        <AuthHeading eyebrow="Account recovery" title="New password" sub="Choose a new password for your Circuit account." />
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </AuthSplitLayout>
  );
}
