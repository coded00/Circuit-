"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatListingPrice } from "@/lib/marketplace";
import { loginPath } from "@/lib/safeRedirect";
import { feedback } from "@/lib/feedback";

/** Buy now, from the wallet or by card: confirm the price, ask for the buyer's details if the listing needs them. */
export function BuyPanel({
  listingId,
  priceKobo,
  buyerPrompt,
  soldOut,
  signedIn,
  walletBalance,
  instant,
  suggestedNote,
}: {
  listingId: string;
  priceKobo: number;
  buyerPrompt: string | null;
  soldOut: boolean;
  signedIn: boolean;
  walletBalance: number;
  /** Delivered the moment it is paid (a hosted download). */
  instant: boolean;
  /** A saved answer to prefill the buyer's details with. */
  suggestedNote: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState(suggestedNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = signedIn && walletBalance < priceKobo;
  const [step, setStep] = useState<"fill" | "review">("fill");
  const [method, setMethod] = useState<"wallet" | "card">("wallet");

  async function buy(event: React.FormEvent) {
    event.preventDefault();
    if (step === "fill") {
      setStep("review");
      return;
    }
    setBusy(true);
    setError(null);
    if (method === "card") {
      // Holds the unit and returns the card checkout's address; the order is confirmed when the payment is.
      const res = await fetch("/api/marketplace/orders/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.authorizationUrl !== "string") {
        setError(data?.error ?? "Couldn't start the card payment.");
        setBusy(false);
        setStep("fill");
        return;
      }
      window.location.href = data.authorizationUrl;
      return;
    }
    const res = await fetch("/api/marketplace/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, note }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't complete the purchase.");
      setBusy(false);
      setStep("fill");
      return;
    }
    feedback("purchase");
    router.push(`/marketplace/orders/${data.id}?placed=1`);
    router.refresh();
  }

  if (soldOut) return <div className="cut-lg border border-border bg-surface-elevated p-4 text-sm text-muted [--cut-line:var(--border)]">Sold out.</div>;
  if (!signedIn) {
    return (
      <div id="buy-panel" className="scroll-mt-24">
        <Link href={loginPath(`/marketplace/${listingId}`)} className="btn-primary w-fit">
          Sign in to buy
        </Link>
      </div>
    );
  }

  const after = walletBalance - priceKobo;

  return (
    <form id="buy-panel" onSubmit={buy} className="cut-lg flex scroll-mt-24 flex-col gap-3 border border-border bg-surface p-4 [--cut-line:var(--border)]">
      {step === "fill" ? (
        <>
          {buyerPrompt && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="buyer-note" className="field-label">
                {buyerPrompt}
              </label>
              <input id="buyer-note" required maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="field-input" />
              {suggestedNote && note === suggestedNote && <span className="field-hint">Filled in from your saved in-game name. Change it if this order is for something else.</span>}
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Your wallet</span>
            <span className={`text-stat ${short ? "text-accent-orange" : ""}`}>{formatListingPrice(walletBalance)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {short ? (
              <>
                <button type="submit" onClick={() => setMethod("card")} className="btn-primary w-fit">
                  Pay {formatListingPrice(priceKobo)} by card
                </button>
                <Link href="/wallet" className="btn-secondary w-fit">
                  Top up wallet
                </Link>
              </>
            ) : (
              <>
                <button type="submit" onClick={() => setMethod("wallet")} className="btn-primary w-fit">
                  Buy for {formatListingPrice(priceKobo)}
                </button>
                <button type="submit" onClick={() => setMethod("card")} className="btn-secondary w-fit">
                  Pay by card
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="text-eyebrow text-muted">Review your order</span>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Price</dt>
              <dd className="text-stat">{formatListingPrice(priceKobo)}</dd>
            </div>
            {method === "wallet" ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Wallet now</dt>
                  <dd className="text-stat">{formatListingPrice(walletBalance)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-border pt-2">
                  <dt className="text-muted">Wallet after</dt>
                  <dd className="text-stat">{formatListingPrice(after)}</dd>
                </div>
              </>
            ) : (
              <div className="flex justify-between gap-4 border-t border-border pt-2">
                <dt className="text-muted">Pay with</dt>
                <dd>Card, on the next page</dd>
              </div>
            )}
            {buyerPrompt && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-muted">{buyerPrompt}</dt>
                <dd className="min-w-0 truncate text-right">{note}</dd>
              </div>
            )}
          </dl>
          {method === "card" && <p className="text-xs text-muted">We hold your item for 20 minutes while you pay. If the payment isn&apos;t completed, it&apos;s released and you aren&apos;t charged.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? (method === "card" ? "Opening checkout…" : "Paying…") : method === "card" ? "Continue to card payment" : "Confirm and pay"}
            </button>
            <button type="button" disabled={busy} onClick={() => setStep("fill")} className="btn-secondary">
              Back
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-[12px] text-muted">
        {instant ? "Pay from your wallet or by card. Your download starts the moment you pay and stays in My orders." : "Pay from your wallet or by card. If Circuit can't deliver, you're refunded the same way."}
      </p>
    </form>
  );
}
