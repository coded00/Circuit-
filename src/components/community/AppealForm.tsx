"use client";

/** Circuit — ask Circuit staff to review a suspension (your account, or a community you own). */

import { useState } from "react";

export function AppealForm({ kind, communityId, pending }: { kind: "ACCOUNT_SUSPENSION" | "COMMUNITY_SUSPENSION"; communityId?: string; pending: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(pending);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/appeals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, communityId, message }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? "Couldn't send your appeal.");
    setSent(true);
  }

  if (sent) return <p className="text-sm text-muted">Your appeal is with the Circuit team. You&apos;ll get a notification when it&apos;s decided.</p>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="appeal" className="text-sm font-semibold">
        Think this was a mistake? Appeal
      </label>
      <textarea
        id="appeal"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        maxLength={1000}
        placeholder="Explain what happened and why it should be reversed."
        className="field-input resize-none"
      />
      {error && <p className="field-error">{error}</p>}
      <button type="submit" disabled={busy || message.trim().length < 10} className="btn-primary h-10 w-fit px-5 text-sm">
        {busy ? "Sending…" : "Send appeal"}
      </button>
    </form>
  );
}
