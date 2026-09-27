"use client";

/**
 * Circuit — the way into a community, matching its join policy:
 * - OPEN: Join (after accepting the rules, if it has any);
 * - APPLY: Apply — rules + the community's question, then a moderator decides;
 * - INVITE: nothing to press without an invite link;
 * - via an invite link (`inviteCode`): Accept invite, rules first if any.
 * Rules are shown in a sheet before joining — agreeing is the join, like
 * Discord's rules screening.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Lock, ScrollText } from "lucide-react";
import { DialogOverlay } from "@/components/ui/Overlay";

type Props = {
  communityId: string;
  name: string;
  joinPolicy: "OPEN" | "APPLY" | "INVITE";
  rules: string | null;
  applicationQuestion: string | null;
  /** Their application is waiting for review. */
  pending?: boolean;
  banned?: boolean;
  /** Joining through /invite/<code> — bypasses the join policy. */
  inviteCode?: string;
  className?: string;
};

export function JoinCommunityPanel({ communityId, name, joinPolicy, rules, applicationQuestion, pending, banned, inviteCode, className = "" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const applying = !inviteCode && joinPolicy === "APPLY";
  const needsDialog = !!rules || (applying && !!applicationQuestion) || applying;

  async function submit() {
    setBusy(true);
    setError(null);
    const url = inviteCode ? `/api/invites/${inviteCode}` : applying ? `/api/communities/${communityId}/applications` : `/api/communities/${communityId}/join`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptRules: agreed || !rules, answer }),
      });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Try again.");
      return;
    }
    setOpen(false);
    if (applying) {
      setApplied(true);
      return;
    }
    if (inviteCode && data?.href) {
      router.replace(data.href);
      return;
    }
    router.refresh();
  }

  if (banned) {
    return <p className={`rounded-[12px] border border-border bg-surface px-4 py-3 text-sm text-muted ${className}`}>You can&apos;t join this community.</p>;
  }
  if (!inviteCode && joinPolicy === "INVITE") {
    return (
      <p className={`flex items-center gap-2 rounded-[12px] border border-border bg-surface px-4 py-3 text-sm text-muted ${className}`}>
        <Lock size={15} className="shrink-0" /> Invite only — ask a member for a link.
      </p>
    );
  }
  if (pending || applied) {
    return (
      <p className={`flex items-center gap-2 rounded-[12px] border border-border bg-surface px-4 py-3 text-sm ${className}`}>
        <Clock size={15} className="shrink-0 text-muted" /> Application sent — you&apos;ll get a notification when a moderator reviews it.
      </p>
    );
  }

  const label = inviteCode ? "Accept invite" : applying ? "Apply to join" : "Join community";
  const canSubmit = (!rules || agreed) && (!applying || !applicationQuestion || answer.trim().length > 0);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => (needsDialog ? setOpen(true) : submit())}
        disabled={busy}
        className="btn-primary h-12 w-full text-[15px] sm:w-auto sm:px-8"
      >
        {busy ? "Joining…" : label}
      </button>
      {error && !open && <p className="field-error mt-2">{error}</p>}

      <DialogOverlay open={open} onClose={() => setOpen(false)} label={label} maxWidth={480}>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:pt-5">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">{applying ? "Apply" : "Before you join"}</p>
            <h2 className="font-display text-xl font-bold tracking-tight">{name}</h2>
          </div>

          {rules && (
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <ScrollText size={15} /> Community rules
              </span>
              <div className="max-h-56 overflow-y-auto rounded-[12px] border border-border bg-surface-elevated/40 px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-line text-muted">
                {rules}
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent-volt)]" />
                I&apos;ve read the rules and agree to follow them
              </label>
            </div>
          )}

          {applying && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{applicationQuestion ?? "Anything the moderators should know? (optional)"}</span>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                maxLength={500}
                rows={3}
                className="field-input resize-none"
                placeholder="Your answer"
              />
            </label>
          )}

          {error && <p className="field-error">{error}</p>}
          <button type="button" onClick={submit} disabled={!canSubmit || busy} className="btn-primary h-11 w-full">
            {busy ? "One moment…" : applying ? "Send application" : (
              <span className="flex items-center justify-center gap-1.5">
                <Check size={16} /> {inviteCode ? "Agree & accept invite" : "Agree & join"}
              </span>
            )}
          </button>
        </div>
      </DialogOverlay>
    </div>
  );
}
