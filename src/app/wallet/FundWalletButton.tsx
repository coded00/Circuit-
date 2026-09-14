"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";

export function FundWalletButton() {
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
    const res = await fetch("/api/wallet/fund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(naira * 100) }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    window.location.href = data.authorizationUrl;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <PlusCircle size={14} />
        Fund Wallet
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
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Redirecting…" : "Continue"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
