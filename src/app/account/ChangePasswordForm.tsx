"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { PasswordField } from "@/components/auth/AuthField";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/ToastProvider";
import { MIN_PASSWORD_LENGTH as MIN } from "@/lib/passwordRules";


export default function ChangePasswordForm() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (next.length < MIN) return setError(`The new password must be at least ${MIN} characters.`);
    if (next !== confirm) return setError("The new passwords don't match.");
    setBusy(true);
    const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res) return setError("We couldn't reach Circuit. Check your connection and try again.");
    if (!res.ok) return setError(data?.error ?? "Something went wrong. Please try again.");
    setCurrent("");
    setNext("");
    setConfirm("");
    toast({ title: "Password changed", message: "Use the new one next time you log in." });
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-4">
      <h2 className="text-[15px] font-semibold">Change password</h2>
      <PasswordField id="currentPassword" label="Current password" icon={Lock} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <PasswordField id="newPassword" label="New password" icon={Lock} autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} hint={`At least ${MIN} characters.`} />
      <PasswordField
        id="confirmNewPassword"
        label="Confirm new password"
        icon={Lock}
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        hint={confirm && confirm === next ? "Passwords match" : undefined}
        hintTone="ok"
      />
      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || !current || !next || !confirm} className="btn-primary w-fit gap-2">
        {busy && <Spinner />}
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
