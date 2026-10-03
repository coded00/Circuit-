"use client";

/**
 * Circuit — report a message, member or community. Pick a reason (the
 * serious ones go straight to Circuit staff; everything else reaches the
 * community's moderators first), optionally add detail.
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { DialogOverlay } from "@/components/ui/Overlay";

const REASONS = [
  { value: "HARASSMENT", label: "Harassment" },
  { value: "HATE", label: "Hate or abuse" },
  { value: "SPAM", label: "Spam" },
  { value: "SCAM", label: "Scam" },
  { value: "SEXUAL", label: "Sexual content" },
  { value: "CHEATING", label: "Cheating" },
  { value: "THREATS", label: "Threats" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "OTHER", label: "Something else" },
];

export type ReportTarget =
  | { targetType: "MESSAGE"; messageId: string }
  | { targetType: "MEMBER"; communityId: string; userId: string }
  | { targetType: "COMMUNITY"; communityId: string }
  | { targetType: "THREAD"; threadId: string };

export function ReportDialog({ open, onClose, target, title }: { open: boolean; onClose: () => void; target: ReportTarget; title: string }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function close() {
    onClose();
    setTimeout(() => {
      setReason("");
      setDetails("");
      setSent(false);
      setError(null);
    }, 300);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/communities/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...target, reason, details }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? "Couldn't send the report. Try again.");
    setSent(true);
  }

  return (
    <DialogOverlay open={open} onClose={close} label={title} maxWidth={460}>
      <div className="flex flex-col gap-4 px-5 pb-5 sm:pt-5">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <Check size={22} />
            </span>
            <p className="font-display text-lg font-bold tracking-tight">Thanks. We&apos;ve got it</p>
            <p className="text-sm text-muted">The right people will review it. You won&apos;t be named to the person you reported.</p>
            <button type="button" onClick={close} className="btn-secondary mt-1 h-10 px-5">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Report</p>
              <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.value}
                  onClick={() => setReason(r.value)}
                  className={`h-9 cut-xs border px-3.5 text-sm font-semibold transition ${
                    reason === r.value ? "border-foreground bg-foreground text-background" : "border-border hover:border-border-hover"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Anything else we should know? (optional)"
              className="field-input resize-none"
            />
            {error && <p className="field-error">{error}</p>}
            <button type="button" onClick={submit} disabled={!reason || busy} className="btn-primary h-11 w-full">
              {busy ? "Sending…" : "Send report"}
            </button>
          </>
        )}
      </div>
    </DialogOverlay>
  );
}
