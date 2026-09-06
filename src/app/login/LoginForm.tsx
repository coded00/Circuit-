"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailOrPhone, password }),
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

  return (
    <form
      onSubmit={handleSubmit}
      className="card flex w-full max-w-sm flex-col gap-5 shadow-2xl shadow-black/50"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="emailOrPhone" className="field-label">
          Email or phone
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
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Logging in…" : "Log in"}
      </button>
      <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn-secondary w-full">
        Need an account? Sign up
      </Link>
    </form>
  );
}
