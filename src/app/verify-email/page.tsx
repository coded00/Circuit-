/**
 * Circuit — where the verification link lands. Verifying doesn't need a
 * session (the token identifies the account), so it works from any
 * device's mail app.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MailWarning } from "lucide-react";
import { verifyEmailToken, type VerifyResult } from "@/lib/emailVerification";
import { getCurrentUser } from "@/lib/session";
import { loginPath } from "@/lib/safeRedirect";

export const metadata: Metadata = { title: "Verify email", robots: { index: false, follow: false } };

const COPY: Record<VerifyResult, { title: string; body: string; ok: boolean }> = {
  verified: { title: "Email verified", body: "Thanks. Your account is verified. You can now create communities, enter paid tournaments, stake in challenges and withdraw.", ok: true },
  already: { title: "Already verified", body: "This email was already verified. You're all set.", ok: true },
  expired: { title: "This link has expired", body: "Links last 24 hours. Send a new one from Account settings.", ok: false },
  changed: { title: "This link is for an old email", body: "Your account's email has changed since this was sent. Send a new link from Account settings.", ok: false },
  invalid: { title: "This link doesn't work", body: "It may have been used already or copied incompletely. Send a new one from Account settings.", ok: false },
};

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const result = await verifyEmailToken(token ?? "");
  const copy = COPY[result];

  // Whether to send them somewhere or to the login form. Signing up no longer issues a session when email
  // is configured (finding #19), so the common visitor here is a brand-new account opening the link from
  // their mail app — signed out, and one step from being able to use what they just made. Someone who was
  // already signed in (resending from Account settings, or verifying a changed address) skips that.
  const signedIn = Boolean(await getCurrentUser());

  return (
    <div className="state-block">
      {copy.ok ? <CheckCircle2 size={40} className="motion-scale-in text-success" /> : <MailWarning size={40} className="text-muted" />}
      <h1 className="state-title">{copy.title}</h1>
      <p className="state-description">
        {copy.ok && !signedIn ? "Your email is confirmed. Log in to finish setting up your account." : copy.body}
      </p>
      <Link href={copy.ok ? (signedIn ? "/communities" : loginPath("/welcome")) : "/account"} className="btn-primary">
        {copy.ok ? (signedIn ? "Go to communities" : "Log in") : "Account settings"}
      </Link>
    </div>
  );
}
