"use client";

/**
 * Circuit — global "you have an incoming Quick Match" modal. Mounted once
 * for signed-in users (src/app/layout.tsx, alongside PresenceHeartbeat),
 * polling /api/quick-match/pending so a challenge interrupts wherever the
 * recipient currently is, not just a page dedicated to it. Rendered in
 * ui/Overlay.tsx's DialogOverlay like every other dialog.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { DialogOverlay } from "@/components/ui/Overlay";
import { QuickMatchChallengeCard, type QuickMatchChallengeInfo } from "@/components/QuickMatchChallengeCard";

const POLL_INTERVAL_MS = 5000;

export function QuickMatchIncomingListener() {
  const router = useRouter();
  const pathname = usePathname();
  const [challenge, setChallenge] = useState<QuickMatchChallengeInfo | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/quick-match/pending");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.challenge && data.challenge.id !== dismissedId) {
          setChallenge(data.challenge);
        } else if (!data.challenge) {
          setChallenge(null);
        }
      } catch {
        // Ignored — the next interval tick retries.
      }
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dismissedId]);

  async function handleAccept() {
    if (!challenge) return;
    const res = await fetch(`/api/quick-match/${challenge.id}/accept`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setChallenge(null);
      router.push(`/battles/${data.battleId}`);
      router.refresh();
      return;
    }
    if (res.status === 423) {
      // Someone else's acceptance is still resolving — worth one retry
      // rather than immediately showing "unavailable" (see the accept
      // route's own comment on this transient window).
      await new Promise((r) => setTimeout(r, 800));
      return handleAccept();
    }
    setUnavailable(true);
    setDismissedId(challenge.id);
    setTimeout(() => {
      setUnavailable(false);
      setChallenge(null);
    }, 3000);
  }

  async function handleDecline() {
    if (!challenge) return;
    await fetch(`/api/quick-match/${challenge.id}/decline`, { method: "POST" });
    setDismissedId(challenge.id);
    setChallenge(null);
  }

  // Suppress the modal while the recipient is already looking at this
  // exact challenge's own dedicated page (src/app/quick-match/[id]/
  // page.tsx renders the same Accept/Decline card there) — without this,
  // a slow poll tick landing while that page is open renders a second,
  // redundant Accept control on top of the first, which is confusing at
  // best and, since both wire up to the same accept endpoint, a genuine
  // double-submit risk at worst.
  const onThisChallengesOwnPage = !!challenge && pathname === `/quick-match/${challenge.id}`;
  const open = (!!challenge || unavailable) && !onThisChallengesOwnPage;

  // Not dismissible by tapping away: a request must be answered (or run
  // out), same as before — the backdrop never closed this one.
  return (
    <DialogOverlay open={open} onClose={() => {}} label="Battle request" maxWidth={400} dismissible={false}>
      {unavailable ? (
        <div className="flex items-start gap-3.5 px-5 pt-2 pb-6 sm:px-6 sm:pt-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center cut-sm bg-surface-elevated text-muted">
            <Clock size={20} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-display text-[17px] font-bold tracking-tight">Too late this time</p>
            <p className="text-sm text-muted">Another player accepted this battle first.</p>
          </div>
        </div>
      ) : (
        challenge && <QuickMatchChallengeCard challenge={challenge} onAccept={handleAccept} onDecline={handleDecline} framed={false} />
      )}
    </DialogOverlay>
  );
}
