"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { MatchFoundHud } from "@/components/MatchFoundHud";

export default function RegistrationForm({
  tournamentId,
  entryFee,
  walletBalance,
}: {
  tournamentId: string;
  entryFee: number;
  walletBalance: number;
}) {
  const router = useRouter();
  const [inGameId, setInGameId] = useState("");
  const canPayFromWallet = entryFee > 0 && walletBalance >= entryFee;
  const [payFromWallet, setPayFromWallet] = useState(canPayFromWallet);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [matchFound, setMatchFound] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inGameId,
        ...(entryFee > 0 && payFromWallet ? { payFrom: "wallet" } : {}),
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
      return;
    }

    // Card payments leave via authorizationUrl above and never reach here
    // (Paystack/Flutterwave's own redirect handles that success moment) —
    // this is the free-entry and pay-from-wallet path, where registration
    // is already complete the instant this response comes back.
    setMatchFound(true);
  }

  if (matchFound) {
    return (
      <MatchFoundHud
        onComplete={() => {
          router.push(`/tournaments/${tournamentId}`);
          router.refresh();
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inGameId" className="field-label">
          In-game ID
        </label>
        <input
          id="inGameId"
          required
          value={inGameId}
          onChange={(e) => setInGameId(e.target.value)}
          className="field-input"
        />
      </div>

      {entryFee > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="field-label">How would you like to pay?</span>
          <label className="flex items-center gap-2 rounded-[10px] border border-border p-3 text-sm">
            <input type="radio" name="payMethod" checked={!payFromWallet} onChange={() => setPayFromWallet(false)} />
            Pay by card (Paystack)
          </label>
          <label
            className={`flex items-center justify-between gap-2 rounded-[10px] border border-border p-3 text-sm ${
              canPayFromWallet ? "" : "cursor-not-allowed opacity-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="payMethod"
                checked={payFromWallet}
                disabled={!canPayFromWallet}
                onChange={() => setPayFromWallet(true)}
              />
              <Wallet size={14} className="text-accent-volt" />
              Pay from Wallet balance
            </span>
            <span className="text-metadata">₦ {(walletBalance / 100).toLocaleString("en-NG")} available</span>
          </label>
        </div>
      )}

      {error && <p className="field-error motion-fade-in">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting && <Spinner />}
        {submitting ? "Registering…" : "Register"}
      </button>
    </form>
  );
}
