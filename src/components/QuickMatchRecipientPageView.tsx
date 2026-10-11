"use client";

/**
 * Circuit — the dedicated-page fallback for a recipient who navigates to
 * /quick-match/[id] (from a notification link) instead of catching the
 * live incoming-challenge modal (QuickMatchIncomingListener). Same
 * accept/decline behavior, just as a full page instead of an overlay.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuickMatchChallengeCard, type QuickMatchChallengeInfo } from "@/components/QuickMatchChallengeCard";
import { QuickMatchRefusalNotice } from "@/components/QuickMatchRefusalNotice";
import { refusalFromResponse, type AcceptRefusal } from "@/lib/quickMatchRefusal";

export function QuickMatchRecipientPageView({
  challenge,
  refusal: initialRefusal,
}: {
  challenge: QuickMatchChallengeInfo;
  /** Set when the page already knows this one is closed — see quickMatchRefusal. */
  refusal: AcceptRefusal | null;
}) {
  const router = useRouter();
  const [refusal, setRefusal] = useState(initialRefusal);

  async function handleAccept() {
    const res = await fetch(`/api/quick-match/${challenge.id}/accept`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      router.replace(`/battles/${data.battleId}`);
      router.refresh();
      return;
    }
    if (res.status === 423) {
      await new Promise((r) => setTimeout(r, 800));
      return handleAccept();
    }
    // The route's own sentence, not a guess at it — the reasons it can give
    // here are a stake limit, a cool-off, an unverified email, a missing date
    // of birth, an empty wallet, or somebody else having won the race, and only
    // the last of those reads anything like "already taken".
    setRefusal(refusalFromResponse(res.status, data));
  }

  async function handleDecline() {
    await fetch(`/api/quick-match/${challenge.id}/decline`, { method: "POST" });
    router.replace("/battles");
  }

  if (refusal) {
    return (
      <div className="card">
        <QuickMatchRefusalNotice refusal={refusal} />
      </div>
    );
  }

  return <QuickMatchChallengeCard challenge={challenge} onAccept={handleAccept} onDecline={handleDecline} />;
}
