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
import { DialogOverlay } from "@/components/ui/Overlay";
import { QuickMatchChallengeCard, type QuickMatchChallengeInfo } from "@/components/QuickMatchChallengeCard";
import { QuickMatchRefusalNotice } from "@/components/QuickMatchRefusalNotice";
import { refusalFromResponse, type AcceptRefusal } from "@/lib/quickMatchRefusal";

const POLL_INTERVAL_MS = 5000;

export function QuickMatchIncomingListener() {
  const router = useRouter();
  const pathname = usePathname();
  const [challenge, setChallenge] = useState<QuickMatchChallengeInfo | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<AcceptRefusal | null>(null);

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
    // Whatever the route said. This used to be a fixed "another player
    // accepted this battle first" whatever came back, which was a lie to every
    // player refused for a reason of their own — a cool-off, a stake limit, an
    // unverified email. See src/lib/quickMatchRefusal.ts.
    const why = refusalFromResponse(res.status, data);
    setRefusal(why);
    // Stops the next poll tick from re-opening the request for the challenge
    // just answered.
    setDismissedId(challenge.id);
    // A challenge somebody else won needs no answer — say so and get out of the
    // way. Anything the player has to act on stays until they close it: three
    // seconds is not long enough to read "verify your email and come back", and
    // by then the modal is the only thing on screen that knew why.
    if (why.gone) {
      setTimeout(() => {
        setRefusal(null);
        setChallenge(null);
      }, 3000);
    }
  }

  function handleRefusalClose() {
    setRefusal(null);
    setChallenge(null);
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
  const open = (!!challenge || !!refusal) && !onThisChallengesOwnPage;

  // Not dismissible by tapping away: a request must be answered (or run
  // out), same as before — the backdrop never closed this one. The refusal
  // panel carries its own Close button once the request *has* been answered.
  return (
    <DialogOverlay open={open} onClose={() => {}} label="Battle request" maxWidth={400} dismissible={false}>
      {refusal ? (
        <QuickMatchRefusalNotice refusal={refusal} onClose={handleRefusalClose} />
      ) : (
        challenge && <QuickMatchChallengeCard challenge={challenge} onAccept={handleAccept} onDecline={handleDecline} framed={false} />
      )}
    </DialogOverlay>
  );
}
