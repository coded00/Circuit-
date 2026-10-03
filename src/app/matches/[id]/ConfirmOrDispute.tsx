"use client";

/**
 * Circuit — what the second player sees once the first has reported: the
 * claimed result and its proof, and two ways to answer. Confirm agrees with
 * it (the match completes straight away). Dispute opens the normal report
 * form so they can say what really happened, with their own proof; if that
 * differs, the match goes to review.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Flag } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/ToastProvider";
import ResultForm from "./ResultForm";

type PlayerOption = { id: string; displayName: string; handle: string; avatarUrl: string | null };

export default function ConfirmOrDispute({
  matchId,
  matchCode,
  opponentName,
  claim,
  playerA,
  playerB,
  drawAllowed,
}: {
  matchId: string;
  matchCode: string;
  opponentName: string;
  claim: { claimText: string; score: string; proofUrl: string | null };
  playerA: PlayerOption;
  playerB: PlayerOption;
  drawAllowed: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"choose" | "dispute">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/matches/${matchId}/confirm`, { method: "POST" });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setBusy(false);
      return;
    }
    toast({ title: "Result confirmed", message: "The match is complete." });
    router.refresh();
  }

  if (mode === "dispute") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Tell us what really happened and add your own proof. If it doesn&apos;t match {opponentName}&apos;s report, the match goes to review.
        </p>
        <ResultForm matchId={matchId} matchCode={matchCode} playerA={playerA} playerB={playerB} drawAllowed={drawAllowed} />
        <button type="button" onClick={() => setMode("choose")} className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-[12px] border border-border bg-surface-elevated p-4">
        <span className="text-eyebrow text-muted">{opponentName} reported</span>
        <span className="font-display text-2xl leading-tight font-bold tracking-tight uppercase">{claim.claimText}</span>
        <span className="text-stat text-lg">{claim.score}</span>
        {claim.proofUrl && (
          <a href={claim.proofUrl} target="_blank" rel="noreferrer" className="mt-1 flex w-fit items-center gap-1.5 text-sm font-medium text-accent-blue hover:underline">
            View their proof <ExternalLink size={13} aria-hidden />
          </a>
        )}
      </div>
      <p className="text-sm text-muted">Is that right? Confirm it to finish the match, or dispute it if it isn&apos;t what happened.</p>
      {error && <p className="field-error motion-fade-in">{error}</p>}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <button type="button" onClick={confirm} disabled={busy} className="btn-primary gap-2">
          {busy ? <Spinner /> : <Check size={16} />}
          Confirm result
        </button>
        <button type="button" onClick={() => setMode("dispute")} disabled={busy} className="btn-secondary gap-2">
          <Flag size={15} />
          Dispute
        </button>
      </div>
    </div>
  );
}
