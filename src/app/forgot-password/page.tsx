import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthHeading } from "@/components/auth/AuthHeading";
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-7">
        <AuthHeading eyebrow="Account recovery" title="Locked out?" sub="Enter your account email and we'll send you a link to get back in." />
        <ForgotPasswordForm />
      </div>
    </AuthSplitLayout>
  );
}
