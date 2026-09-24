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

export function QuickMatchRecipientPageView({
  challenge,
  alreadyResolved,
}: {
  challenge: QuickMatchChallengeInfo;
  alreadyResolved: boolean;
}) {
  const router = useRouter();
  const [unavailable, setUnavailable] = useState(alreadyResolved);

  async function handleAccept() {
    const res = await fetch(`/api/quick-match/${challenge.id}/accept`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      router.push(`/battles/${data.battleId}`);
      router.refresh();
      return;
    }
    if (res.status === 423) {
      await new Promise((r) => setTimeout(r, 800));
      return handleAccept();
    }
    setUnavailable(true);
  }

  async function handleDecline() {
    await fetch(`/api/quick-match/${challenge.id}/decline`, { method: "POST" });
    router.push("/battles");
  }

  if (unavailable) {
    return (
      <div className="card flex flex-col items-center gap-2 p-6 text-center">
        <p className="font-semibold">Battle unavailable</p>
        <p className="text-sm text-muted">This challenge was already accepted by another player.</p>
      </div>
    );
  }

  return <QuickMatchChallengeCard challenge={challenge} onAccept={handleAccept} onDecline={handleDecline} />;
}
