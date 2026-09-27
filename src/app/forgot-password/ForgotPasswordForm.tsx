"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, AtSign, MailCheck } from "lucide-react";
import { AuthField } from "@/components/auth/AuthField";
import { Spinner } from "@/components/Spinner";

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
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-[12px] border border-success/25 bg-success/[0.08] p-4">
          <MailCheck size={20} className="mt-0.5 shrink-0 text-success" />
          <p className="text-sm leading-relaxed">{message}</p>
        </div>
        <Link href="/login" className="flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-foreground">
          <ArrowLeft size={15} /> Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AuthField
        id="emailOrPhone"
        label="Email or phone"
        icon={AtSign}
        type="text"
        inputMode="email"
        required
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="you@example.com or 080…"
        value={emailOrPhone}
        onChange={(e) => setEmailOrPhone(e.target.value)}
        hint="We'll send a reset link to the email on your account."
      />
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary h-12 w-full text-[15px]">
        {submitting && <Spinner />}
        {submitting ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-muted transition hover:text-foreground">
        <ArrowLeft size={15} /> Back to log in
      </Link>
    </form>
  );
}
