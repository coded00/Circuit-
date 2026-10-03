"use client";

/**
 * Circuit — Account settings › Sign-in methods: how this account can be
 * signed into. Password (if set) and Google, with connect/disconnect for
 * Google. Connecting starts the same OAuth flow with intent "link", which
 * attaches the Google identity to *this* account — the way phone-number
 * accounts (or anyone whose Google email differs) join the two up.
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { GoogleMark } from "@/components/auth/GoogleButton";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { oauthErrorMessage } from "@/lib/oauth/errors";

const STATUS: Record<string, { tone: "ok" | "error"; text: string }> = {
  linked: { tone: "ok", text: "Google is connected. You can now sign in with it." },
  taken: { tone: "error", text: "That Google account is already connected to a different Circuit account." },
  already_linked: { tone: "error", text: "This account is already connected to a different Google account. Disconnect it first." },
};

export function SignInMethods({
  hasPassword,
  google,
  googleEnabled,
}: {
  hasPassword: boolean;
  google: { email: string | null } | null;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const confirmDialog = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const code = params.get("google");
  const status = code ? (STATUS[code] ?? { tone: "error" as const, text: oauthErrorMessage(code) ?? "" }) : null;

  async function disconnect() {
    const ok = await confirmDialog({
      title: "Disconnect Google?",
      message: "You'll sign in with your password instead. You can connect Google again any time.",
      confirmLabel: "Disconnect",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/identities/google", { method: "DELETE" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(data?.error ?? "Couldn't disconnect Google. Try again.");
    router.replace("/account");
    router.refresh();
  }

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-section-heading">Sign-in methods</h2>
        <p className="text-sm text-muted">All of these open the same Circuit account.</p>
      </div>

      {status?.text && (
        <p role="status" className={`rounded-[10px] border px-3.5 py-2.5 text-sm ${status.tone === "ok" ? "border-success/30 bg-success/10" : "border-danger/30 bg-danger/10"}`}>
          {status.text}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-border rounded-[12px] border border-border">
        <li className="flex items-center gap-3 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-muted">
            <KeyRound size={17} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">Password</span>
            <span className="truncate text-xs text-muted">{hasPassword ? "Set" : "Not set. Use “Forgot password” on the login page to add one"}</span>
          </div>
        </li>
        <li className="flex items-center gap-3 p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated">
            <GoogleMark size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">Google</span>
            <span className="truncate text-xs text-muted">{google ? `Connected${google.email ? ` · ${google.email}` : ""}` : "Not connected"}</span>
          </div>
          {google ? (
            <button type="button" onClick={disconnect} disabled={busy} className="btn-secondary shrink-0 px-3.5 py-2 text-[13px]">
              Disconnect
            </button>
          ) : googleEnabled ? (
            <a href="/api/auth/google?intent=link" className="btn-secondary shrink-0 px-3.5 py-2 text-[13px]">
              Connect
            </a>
          ) : (
            <span className="shrink-0 text-xs text-muted-strong">Unavailable</span>
          )}
        </li>
      </ul>
      {error && <p className="field-error" role="alert">{error}</p>}
    </section>
  );
}
