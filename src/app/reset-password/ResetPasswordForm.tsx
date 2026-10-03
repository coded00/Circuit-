"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { PasswordField } from "@/components/auth/AuthField";
import { Spinner } from "@/components/Spinner";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <p className="alert alert-danger">
        This reset link is missing its token. Request a new one from the{" "}
        <Link href="/forgot-password" className="font-medium underline">
          forgot password
        </Link>{" "}
        page.
      </p>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    const data = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }

    setDone(true);
    setTimeout(() => router.replace("/login"), 2000);
  }

  if (done) {
    return (
      <div className="flex items-start gap-3 cut-sm border border-success/25 bg-success/[0.08] p-4">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" />
        <p className="text-sm leading-relaxed">Password updated. Taking you to log in…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PasswordField
        id="password"
        label="New password"
        icon={Lock}
        required
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordField
        id="confirmPassword"
        label="Confirm new password"
        icon={Lock}
        required
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        hint={confirmPassword && confirmPassword === password ? "Passwords match" : undefined}
        hintTone="ok"
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
          {/* An expired or used link can't be retried — send them to get a fresh one. */}
          {error.includes("expired") && (
            <>
              {" "}
              <Link href="/forgot-password" className="font-semibold underline">
                Request a new link
              </Link>
              .
            </>
          )}
        </p>
      )}
      <button type="submit" disabled={submitting} className="btn-primary h-12 w-full text-[15px]">
        {submitting && <Spinner />}
        {submitting ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
