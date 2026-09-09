"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountForm({
  initialDisplayName,
  initialAvatarUrl,
  initialPayoutMethodRef,
  initialDateOfBirth,
}: {
  initialDisplayName: string;
  initialAvatarUrl: string;
  initialPayoutMethodRef: string;
  initialDateOfBirth: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [payoutMethodRef, setPayoutMethodRef] = useState(initialPayoutMethodRef);
  const [dateOfBirth, setDateOfBirth] = useState(initialDateOfBirth);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);

    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        avatarUrl: avatarUrl || null,
        payoutMethodRef: payoutMethodRef || null,
        dateOfBirth: dateOfBirth || null,
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="field-label">
          Display name
        </label>
        <input
          id="displayName"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="field-input"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="avatarUrl" className="field-label">
          Avatar URL (optional)
        </label>
        <input
          id="avatarUrl"
          type="url"
          placeholder="https://…"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          className="field-input"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="dateOfBirth" className="field-label">
          Date of birth
        </label>
        <input
          id="dateOfBirth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">
          Required before any paid registration or prize payout (ACC-3) — never checked for free
          browsing or free tournaments.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="payoutMethodRef" className="field-label">
          Payout method reference (optional)
        </label>
        <input
          id="payoutMethodRef"
          placeholder="Paystack recipient code, e.g. RCP_xxx"
          value={payoutMethodRef}
          onChange={(e) => setPayoutMethodRef(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">
          Known V1 gap: there&apos;s no UI yet to link a bank account and get a real recipient
          code — this field takes the raw reference directly until that&apos;s built.
        </span>
      </div>

      {error && <p className="field-error">{error}</p>}
      {success && <p className="text-sm text-success">Saved.</p>}

      <button type="submit" disabled={submitting} className="btn-primary self-start">
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
