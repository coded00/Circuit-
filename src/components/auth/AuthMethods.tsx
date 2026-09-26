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
        <p role="alert" className="rounded-[11px] border border-danger/30 bg-danger/[0.12] px-3.5 py-3 text-sm leading-relaxed text-foreground">
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
        <div className={googleEnabled ? "motion-slide-up" : undefined}>{children}</div>
      ) : (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-white/[0.1] bg-white/[0.03] text-[15px] font-semibold text-foreground transition hover:border-white/[0.18] hover:bg-white/[0.06] active:scale-[0.99]"
        >
          <Mail size={18} className="text-muted" />
          Continue with email
        </button>
      )}
    </div>
  );
}
