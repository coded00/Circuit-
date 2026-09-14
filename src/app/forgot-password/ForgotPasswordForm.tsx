"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOrPhone }),
    });

    const data = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }

    setMessage(data?.message ?? "If an account exists for that email, we've sent password reset instructions.");
  }

  if (message) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="alert alert-success">{message}</p>
        <Link href="/login" className="text-sm font-medium text-accent-blue hover:underline">
          ← Back to login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="emailOrPhone" className="field-label">
          Email
        </label>
        <input
          id="emailOrPhone"
          type="text"
          required
          autoComplete="username"
          value={emailOrPhone}
          onChange={(e) => setEmailOrPhone(e.target.value)}
          className="field-input"
        />
        <p className="field-hint">
          Recovery by phone isn&apos;t available yet — use the email on your account if you have one.
        </p>
      </div>
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="text-center text-sm text-muted transition hover:text-foreground">
        ← Back to login
      </Link>
    </form>
  );
}
