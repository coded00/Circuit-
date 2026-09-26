"use client";

/**
 * Circuit — the sign-in method choice on /login and /signup:
 *
 *   [ Continue with Google ]
 *   ─────────── or ───────────
 *   [ Continue with email ]   → expands to the existing email form
 *
 * The email form is the existing one (passed as children), unchanged. If
 * Google sign-in isn't configured, the email form simply shows directly.
 * A failed Google attempt comes back with `?error=` and its friendly
 * message shows at the top.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { safeNextPath } from "@/lib/safeRedirect";
import { oauthErrorMessage } from "@/lib/oauth/errors";
import { AuthDivider, GoogleButton, googleStartHref } from "./GoogleButton";

export function AuthMethods({
  from,
  googleEnabled,
  children,
}: {
  from: "login" | "signup";
  googleEnabled: boolean;
  /** The email form. */
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const error = oauthErrorMessage(searchParams.get("error"));
  const [showEmail, setShowEmail] = useState(!googleEnabled || searchParams.get("method") === "email");

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-foreground">
          {error}
        </p>
      )}
      {googleEnabled && (
        <>
          <GoogleButton href={googleStartHref(from, next)} />
          <AuthDivider />
        </>
      )}
      {showEmail ? (
        children
      ) : (
        <button type="button" onClick={() => setShowEmail(true)} className="btn-secondary h-12 w-full gap-3 text-[15px]">
          <Mail size={18} />
          Continue with email
        </button>
      )}
    </div>
  );
}
