"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck, UserX, Clock } from "lucide-react";

/**
 * Circuit — Discovery Phase 3's join action, reused on both a team's own
 * detail page and its Discovery card. Same state-driven-button shape as
 * FriendButton (src/components/FriendButton.tsx) — "member"/"invited" are
 * included for full reuse on a Discovery card (rare edge case: browsing to
 * a team that already invited you), even though the team detail page only
 * ever renders this for "none"/"requested" (captain/member/invited already
 * have their own dedicated UI there).
 */
export type TeamMembershipStatus =
  | { state: "none" }
  | { state: "member" }
  | { state: "invited"; membershipId: string }
  | { state: "requested"; membershipId: string };

export function TeamMembershipButton({
  teamId,
  viewerId,
  status,
}: {
  teamId: string;
  viewerId: string;
  status: TeamMembershipStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    await fetch(`/api/teams/${teamId}/request`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function cancelOrDecline() {
    setBusy(true);
    await fetch(`/api/teams/${teamId}/members/${viewerId}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  async function acceptInvite() {
    setBusy(true);
    await fetch(`/api/teams/${teamId}/accept`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  if (status.state === "member") {
    return <span className="badge badge-brand">Member</span>;
  }

  if (status.state === "invited") {
    return (
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={acceptInvite} className="btn-primary">
          <UserCheck size={14} />
          Accept
        </button>
        <button type="button" disabled={busy} onClick={cancelOrDecline} className="btn-secondary">
          <UserX size={14} />
          Decline
        </button>
      </div>
    );
  }

  if (status.state === "requested") {
    return (
      <button type="button" disabled={busy} onClick={cancelOrDecline} className="btn-secondary">
        <Clock size={14} />
        Request Sent
      </button>
    );
  }

  return (
    <button type="button" disabled={busy} onClick={request} className="btn-secondary">
      <UserPlus size={14} />
      Request to Join
    </button>
  );
}
