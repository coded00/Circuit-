import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { safeNextPath } from "@/lib/safeRedirect";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";
import { AuthHeading } from "@/components/auth/AuthHeading";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Forgot Password",
  description:
    "Reset your Circuit password.",
  path: "/forgot-password",
  noindex: true,
});


export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  // Already signed in: this page has nothing to offer, so continue to
  // wherever they were headed (redirect() replaces the history entry).
  if (await getCurrentUser()) {
    const { next } = await searchParams;
    redirect(safeNextPath(typeof next === "string" ? next : null));
  }

  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-7">
        <AuthHeading eyebrow="Account recovery" title="Locked out?" sub="Enter your account email and we'll send you a link to get back in." />
        <ForgotPasswordForm />
      </div>
    </AuthSplitLayout>
  );
}
