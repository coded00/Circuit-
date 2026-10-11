"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatNaira } from "@/lib/dailyChallengeView";

/**
 * Circuit — the Enter / Withdraw control on a Daily Challenge page.
 *
 * The page decides which of these the viewer can do and why not (it has the rows and the clock); this component only
 * asks for confirmation before money moves and shows whatever the server answers. The server re-checks everything
 * under a lock, so a page that went stale while it was open produces a message here, never a wrong charge.
 */

export type EntryPanelState =
  | { kind: "signed-out"; loginHref: string }
  | { kind: "can-enter" }
  | { kind: "entered"; canWithdraw: boolean; withdrawBlocked?: string }
  | { kind: "blocked"; message: string };

export function DailyChallengeEntryPanel({
  challengeId,
  entryFee,
  balance,
  gameName,
  hasInGameName,
  state,
  acknowledge,
  entryCode,
}: {
  challengeId: string;
  entryFee: number;
  balance: number;
  gameName: string;
  hasInGameName: boolean;
  state: EntryPanelState;
  /** What happens to the fee if nobody qualifies, when that is something the player must agree to before paying. */
  acknowledge?: string | null;
  /** The player's own entry code, to show at the start of a screen recording. */
  entryCode?: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const free = entryFee === 0;

  async function post(action: "enter" | "withdraw") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/daily-challenges/${challengeId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledged: agreed }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (state.kind === "signed-out") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Sign in to enter. You&apos;ll need a {gameName} in-game name on your profile{free ? "." : " and money in your wallet."}</p>
        <Link href={state.loginHref} className="btn-primary self-start">
          Sign in to enter
        </Link>
      </div>
    );
  }

  if (state.kind === "blocked") {
    return <p className="text-sm text-muted">{state.message}</p>;
  }

  if (state.kind === "entered") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">You&apos;re in. Play your match in the window, then upload your evidence.</p>
        {entryCode && (
          <div className="flex flex-col gap-1 border border-border-strong bg-surface-elevated p-3">
            <span className="text-xs text-muted uppercase">Your entry code</span>
            <span className="font-mono text-2xl font-bold tracking-[0.25em]">{entryCode}</span>
            <span className="text-xs text-muted">Start your screen recording by showing this code on this page, then open the game. Staff check for it.</span>
          </div>
        )}
        {state.canWithdraw ? (
          confirming ? (
            <div className="flex flex-col gap-2 border border-border-strong bg-surface-elevated p-3">
              <p className="text-sm">{free ? "Leave this challenge?" : `Leave and get your ${formatNaira(entryFee)} back in your wallet?`}</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => post("withdraw")} className="btn-danger-solid">
                  {busy ? "Working…" : "Yes, withdraw"}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="btn-ghost">
                  Stay in
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="btn-secondary self-start">
              Withdraw
            </button>
          )
        ) : (
          state.withdrawBlocked && <p className="text-xs text-muted">{state.withdrawBlocked}</p>
        )}
        {error && <p className="field-error">{error}</p>}
      </div>
    );
  }

  // can-enter
  const short = !free && balance < entryFee;
  return (
    <div className="flex flex-col gap-3">
      {!hasInGameName && (
        <p className="text-sm text-gold">
          Add your {gameName} in-game name first — reviewers match your evidence to it.{" "}
          <Link href="/account" className="underline">
            Open account settings
          </Link>
        </p>
      )}
      {confirming ? (
        <div className="flex flex-col gap-2 border border-border-strong bg-surface-elevated p-3">
          <p className="text-sm">
            {free ? (
              "Enter this free challenge?"
            ) : (
              <>
                <strong>{formatNaira(entryFee)}</strong> will be taken from your wallet now. You can withdraw for a full refund until the match window starts, and
                everyone is refunded if the challenge is cancelled. If you enter and never upload a score, the fee isn&apos;t returned.
              </>
            )}
          </p>
          {acknowledge && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                I understand: <strong>{acknowledge}</strong>
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy || (!!acknowledge && !agreed)} onClick={() => post("enter")} className="btn-primary">
              {busy ? "Entering…" : free ? "Yes, enter" : `Pay ${formatNaira(entryFee)} and enter`}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!hasInGameName || short} onClick={() => setConfirming(true)} className="btn-primary">
            {free ? "Enter free" : `Enter · ${formatNaira(entryFee)}`}
          </button>
          {!free && <span className="text-xs text-muted">Wallet {formatNaira(balance)}</span>}
          {short && (
            <Link href="/wallet" className="text-xs underline">
              Add funds
            </Link>
          )}
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
