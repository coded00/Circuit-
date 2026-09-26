"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AtSign, Lock, UserRound } from "lucide-react";
import { safeNextPath } from "@/lib/safeRedirect";
import { HANDLE_PATTERN } from "@/lib/handles";
import { AuthField, PasswordField } from "@/components/auth/AuthField";
import { Spinner } from "@/components/Spinner";

const MIN_PASSWORD = 8;

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [handle, setHandle] = useState("");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, emailOrPhone, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  const handleState = handle.length === 0 ? "empty" : HANDLE_PATTERN.test(handle) ? "ok" : handle.length < 3 ? "short" : "bad";
  const passwordProgress = Math.min(1, password.length / MIN_PASSWORD);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AuthField
        id="handle"
        label="Username"
        icon={UserRound}
        type="text"
        required
        minLength={3}
        maxLength={20}
        pattern="[a-z0-9_]{3,20}"
        autoComplete="nickname"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="e.g. tobiking"
        value={handle}
        onChange={(e) => setHandle(e.target.value.toLowerCase())}
        hint={
          handleState === "ok"
            ? `You'll be @${handle}`
            : handleState === "bad"
              ? "Only letters, numbers and underscores."
              : "3–20 letters, numbers or underscores. This is your public @name."
        }
        hintTone={handleState === "ok" ? "ok" : handleState === "bad" ? "error" : "muted"}
      />
      <AuthField
        id="emailOrPhone"
        label="Email or phone"
        icon={AtSign}
        type="text"
        required
        autoComplete="username"
        inputMode="email"
        placeholder="you@example.com or 080…"
        value={emailOrPhone}
        onChange={(e) => setEmailOrPhone(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        <PasswordField
          id="password"
          label="Password"
          icon={Lock}
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex items-center gap-2.5" aria-hidden>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={`h-full rounded-full transition-[width,background-color] duration-300 ${passwordProgress >= 1 ? "bg-accent-volt" : "bg-white/30"}`}
              style={{ width: `${passwordProgress * 100}%` }}
            />
          </div>
          <span className={`font-mono text-[11px] tabular-nums ${passwordProgress >= 1 ? "text-accent-volt" : "text-muted-strong"}`}>
            {passwordProgress >= 1 ? "Good to go" : `${password.length}/${MIN_PASSWORD}`}
          </span>
        </div>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting} className="btn-primary h-12 w-full text-[15px]">
        {submitting && <Spinner />}
        {submitting ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
