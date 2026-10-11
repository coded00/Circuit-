"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { REVIEW_REASON_CODES, REVIEW_REASON_LABEL, targetMet, type ReviewDecision } from "@/lib/dailyChallenges";

export type ReviewRequirement = {
  id: string;
  kind: "CONDITION" | "TARGET";
  label: string;
  unit: string | null;
  direction: "HIGHER" | "LOWER" | null;
  threshold: number | null;
  claimedMet: boolean | null;
  claimedValue: number | null;
};

/**
 * Circuit — a reviewer's decision on one submission, made by hand against the evidence.
 *
 * A condition is a met / not met choice. A target is the number the reviewer reads off the evidence, and whether it
 * meets the target is worked out from that number (here for the reviewer's benefit, and again on the server, which
 * never trusts the form's own answer). The score the reviewer enters is the verified one and is what ranks — it
 * starts at what the player claimed, and changing it is recorded as a correction.
 */
export function SubmissionReviewForm({
  submissionId,
  claimedScore,
  claimedTiebreak,
  metricLabel,
  tiebreakLabel,
  requirements,
}: {
  submissionId: string;
  claimedScore: number;
  claimedTiebreak: number | null;
  metricLabel: string;
  tiebreakLabel: string | null;
  requirements: ReviewRequirement[];
}) {
  const router = useRouter();
  const uid = useId();
  const [decision, setDecision] = useState<ReviewDecision>("APPROVE");
  const [score, setScore] = useState(String(claimedScore));
  const [tiebreak, setTiebreak] = useState(claimedTiebreak === null ? "" : String(claimedTiebreak));
  const [conditions, setConditions] = useState<Record<string, boolean | null>>(() => Object.fromEntries(requirements.filter((r) => r.kind === "CONDITION").map((r) => [r.id, null])));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(requirements.filter((r) => r.kind === "TARGET").map((r) => [r.id, r.claimedValue === null ? "" : String(r.claimedValue)])));
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetStatus = useMemo(() => {
    const out: Record<string, boolean | null> = {};
    for (const r of requirements) {
      if (r.kind !== "TARGET") continue;
      const raw = values[r.id];
      const n = raw?.trim() === "" ? NaN : Number(raw);
      out[r.id] = Number.isInteger(n) && r.threshold !== null ? targetMet(r.direction ?? "HIGHER", r.threshold, n) : null;
    }
    return out;
  }, [requirements, values]);

  const anyFailed = requirements.some((r) => (r.kind === "CONDITION" ? conditions[r.id] === false : targetStatus[r.id] === false));

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/daily-challenges/submissions/${submissionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        verifiedScore: decision === "APPROVE" ? score : null,
        verifiedTiebreak: decision === "APPROVE" && tiebreakLabel ? tiebreak : null,
        reasonCode: decision === "APPROVE" ? null : reasonCode || null,
        note,
        verdicts: requirements.map((r) => (r.kind === "CONDITION" ? { requirementId: r.id, met: conditions[r.id] ?? undefined } : { requirementId: r.id, verifiedValue: values[r.id] })),
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  const field = "flex flex-col gap-1.5";
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      {requirements.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-medium text-muted uppercase">Requirements — check each against the evidence</p>
          {requirements.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-border px-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-[13px] text-foreground">{r.label}</span>
                <span className="text-[12px] text-muted">
                  {r.kind === "CONDITION"
                    ? `Player says: ${r.claimedMet ? "met" : "not met"}`
                    : `Needs to be ${r.direction === "LOWER" ? "at most" : "at least"} ${r.threshold}${r.unit ? ` ${r.unit}` : ""} · player says ${r.claimedValue}`}
                </span>
              </div>
              {r.kind === "CONDITION" ? (
                <div role="radiogroup" aria-label={r.label} className="flex gap-2">
                  {[true, false].map((v) => (
                    <label key={String(v)} className={`cut-xs cursor-pointer px-3 py-1.5 text-[13px] ${conditions[r.id] === v ? (v ? "bg-success/20 text-success" : "bg-danger/20 text-danger") : "bg-surface-elevated text-muted"}`}>
                      <input type="radio" className="sr-only" name={`${uid}-c${i}`} checked={conditions[r.id] === v} onChange={() => setConditions((c) => ({ ...c, [r.id]: v }))} />
                      {v ? "Met" : "Not met"}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Verified ${r.label}`}
                    inputMode="numeric"
                    value={values[r.id] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value }))}
                    className="field-input w-24"
                  />
                  <span className={`text-[12px] ${targetStatus[r.id] === true ? "text-success" : targetStatus[r.id] === false ? "text-danger" : "text-muted"}`}>
                    {targetStatus[r.id] === true ? "Meets target" : targetStatus[r.id] === false ? "Misses target" : "Enter the number"}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div role="radiogroup" aria-label="Decision" className="flex flex-wrap gap-2">
        {(["APPROVE", "REJECT", "DISQUALIFY"] as const).map((d) => (
          <label key={d} className={`cut-xs cursor-pointer px-3.5 py-2 text-[13px] font-medium ${decision === d ? "bg-foreground text-background" : "bg-surface-elevated text-muted"}`}>
            <input type="radio" className="sr-only" name={`${uid}-decision`} checked={decision === d} onChange={() => setDecision(d)} />
            {d === "APPROVE" ? "Approve" : d === "REJECT" ? "Reject" : "Disqualify"}
          </label>
        ))}
      </div>
      {decision === "APPROVE" && anyFailed && <p className="text-[12px] text-danger">A requirement isn&apos;t met, so this can&apos;t be approved. Choose Reject.</p>}

      {decision === "APPROVE" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={field}>
            <label htmlFor={`${uid}-score`} className="field-label">Verified {metricLabel.toLowerCase()}</label>
            <input id={`${uid}-score`} inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} className="field-input" />
            {score !== String(claimedScore) && <span className="text-[12px] text-gold">Player claimed {claimedScore} — this will be recorded as a correction.</span>}
          </div>
          {tiebreakLabel && (
            <div className={field}>
              <label htmlFor={`${uid}-tb`} className="field-label">Verified {tiebreakLabel.toLowerCase()}</label>
              <input id={`${uid}-tb`} inputMode="numeric" value={tiebreak} onChange={(e) => setTiebreak(e.target.value)} className="field-input" />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className={field}>
            <label htmlFor={`${uid}-reason`} className="field-label">Reason (the player is told)</label>
            <select id={`${uid}-reason`} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="field-select sm:w-96">
              <option value="">Choose a reason…</option>
              {REVIEW_REASON_CODES.map((c) => (
                <option key={c} value={c}>
                  {REVIEW_REASON_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className={field}>
            <label htmlFor={`${uid}-note`} className="field-label">{decision === "DISQUALIFY" ? "Explanation (required)" : "Note (optional)"}</label>
            <textarea id={`${uid}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="field-input" />
          </div>
          {decision === "DISQUALIFY" && <p className="text-[12px] text-muted">A disqualification keeps the entry fee and goes in the audit log. The player can appeal.</p>}
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
      <div>
        <button type="button" disabled={busy || (decision === "APPROVE" && anyFailed)} onClick={submit} className={decision === "APPROVE" ? "btn-primary" : "btn-danger-solid"}>
          {busy ? "Saving…" : decision === "APPROVE" ? "Approve score" : decision === "REJECT" ? "Reject submission" : "Disqualify entry"}
        </button>
      </div>
    </div>
  );
}
