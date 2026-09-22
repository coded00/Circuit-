"use client";

/**
 * Circuit — global "you have an incoming Quick Match" modal. Mounted once
 * for signed-in users (src/app/layout.tsx, alongside PresenceHeartbeat),
 * polling /api/quick-match/pending so a challenge interrupts wherever the
 * recipient currently is, not just a page dedicated to it. Same
 * portal-to-body + framer-motion backdrop pattern as the redesigned
 * NotificationBell panel, for visual consistency — see that component's
 * own comment on why the portal is needed (TopBar's backdrop-blur creates
 * a containing block that would otherwise clip a plain `position: fixed`
 * child to the header's own height).
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { QuickMatchChallengeCard, type QuickMatchChallengeInfo } from "@/components/QuickMatchChallengeCard";

const POLL_INTERVAL_MS = 5000;

export function QuickMatchIncomingListener() {
  const router = useRouter();
  const pathname = usePathname();
  const [challenge, setChallenge] = useState<QuickMatchChallengeInfo | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-time post-mount flag to gate the portal target (document.body), not a data-fetch/subscription effect
    setMounted(true);
  }, []);

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

  return (
    mounted &&
    createPortal(
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="quick-match-backdrop"
              className="fixed inset-0 z-40 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
            <motion.div
              key="quick-match-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Battle request"
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="w-full max-w-[380px]">
                {unavailable ? (
                  <div className="card flex flex-col items-center gap-2 p-6 text-center">
                    <p className="font-semibold">Battle unavailable</p>
                    <p className="text-sm text-muted">This challenge was already accepted by another player.</p>
                  </div>
                ) : (
                  challenge && <QuickMatchChallengeCard challenge={challenge} onAccept={handleAccept} onDecline={handleDecline} />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    )
  );
}
