"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Lock } from "lucide-react";
import { PasswordField } from "@/components/auth/AuthField";
import { GoogleMark } from "@/components/auth/GoogleButton";
import { Spinner } from "@/components/Spinner";

export default function LinkGoogleForm({ handle, displayName, avatarUrl }: { handle: string; displayName: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch("/api/auth/google/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 410) return router.replace("/login?error=google_expired");
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }
    router.replace(data?.next ?? "/");
    router.refresh();
  }

  async function leave(to: string) {
    await fetch("/api/auth/google/cancel", { method: "POST" }).catch(() => undefined);
    window.location.assign(to);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3 cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] bg-white/[0.03] p-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user avatar, arbitrary host
          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="h-11 w-11 shrink-0 cut-avatar object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center cut-avatar bg-surface text-base font-semibold text-muted">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{displayName}</span>
          <span className="truncate font-mono text-xs text-muted">@{handle}</span>
        </div>
        <span className="flex items-center gap-1 text-muted" aria-label="will be linked to Google">
          <Link2 size={14} />
          <GoogleMark size={16} />
        </span>
      </div>

      <PasswordField
        id="password"
        label="Circuit password"
        icon={Lock}
        required
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        labelAside={
          <Link href="/forgot-password" className="text-xs font-medium text-muted transition hover:text-foreground">
            Forgot password?
          </Link>
        }
      />

      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary h-12 w-full text-[15px]">
        {submitting && <Spinner />}
        {submitting ? "Linking…" : "Link Google & log in"}
      </button>
      <div className="flex items-center justify-between gap-3 text-sm">
        <button type="button" onClick={() => leave("/api/auth/google?intent=signin&from=login")} className="text-muted transition hover:text-foreground">
          Use a different Google account
        </button>
        <button type="button" onClick={() => leave("/login")} className="text-muted transition hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
