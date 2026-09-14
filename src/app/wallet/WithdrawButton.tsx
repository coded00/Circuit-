"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine } from "lucide-react";

export function WithdrawButton({ hasPayoutMethod }: { hasPayoutMethod: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const naira = Number(amount);
    if (!Number.isFinite(naira) || naira <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(naira * 100) }),
    });

    const data = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }

    setOpen(false);
    setAmount("");
    router.refresh();
  }

  if (!hasPayoutMethod) {
    return (
      <button type="button" disabled title="Link a payout method first" className="btn-secondary opacity-50">
        <ArrowDownToLine size={14} />
        Withdraw
      </button>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary">
        <ArrowDownToLine size={14} />
        Withdraw
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={100}
          step="0.01"
          required
          autoFocus
          placeholder="Amount (₦)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="field-input w-36"
        />
        <button type="submit" disabled={submitting} className="btn-secondary">
          {submitting ? "Withdrawing…" : "Confirm"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
