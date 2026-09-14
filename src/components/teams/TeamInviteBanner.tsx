"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserX } from "lucide-react";

export function TeamInviteBanner({ teamId, viewerId }: { teamId: string; viewerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    await fetch(`/api/teams/${teamId}/accept`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function decline() {
    setBusy(true);
    await fetch(`/api/teams/${teamId}/members/${viewerId}`, { method: "DELETE" });
    setBusy(false);
    router.push("/teams");
  }

  return (
    <div className="card flex items-center justify-between gap-3">
      <p className="text-sm">You&apos;ve been invited to join this team.</p>
      <div className="flex shrink-0 gap-2">
        <button type="button" disabled={busy} onClick={accept} className="btn-primary">
          <UserCheck size={13} />
          Accept
        </button>
        <button type="button" disabled={busy} onClick={decline} className="btn-secondary">
          <UserX size={13} />
          Decline
        </button>
      </div>
    </div>
  );
}
