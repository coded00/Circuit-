"use client";

/** Circuit — "verify your email" prompt with a resend button (Account settings, create-community gate). */

import { useState } from "react";
import { MailCheck } from "lucide-react";

export function EmailVerificationBanner({ email, reason }: { email: string; reason?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    const res = await fetch("/api/auth/verify-email", { method: "POST" }).catch(() => null);
    if (res?.ok) return setState("sent");
    setState("idle");
    setError((await res?.json().catch(() => null))?.error ?? "Couldn't send the email. Try again.");
  }

  return (
    <div className="flex flex-col gap-3 cut-sm [--cut-line:var(--border)] border border-border bg-surface p-4 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center cut-avatar bg-accent-volt/20 text-foreground">
        <MailCheck size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm font-semibold">Verify your email</p>
        <p className="text-[13px] text-muted">
          {state === "sent" ? `Check ${email} for a link (it lasts 24 hours).` : (reason ?? `Confirm ${email} is yours to unlock creating communities.`)}
        </p>
        {error && <p className="field-error">{error}</p>}
      </div>
      {state !== "sent" && (
        <button type="button" onClick={send} disabled={state === "sending"} className="btn-primary h-10 shrink-0 px-4 text-sm">
          {state === "sending" ? "Sending…" : "Send link"}
        </button>
      )}
    </div>
  );
}
