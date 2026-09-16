"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock } from "lucide-react";

/**
 * Circuit — one of my own outstanding "request to join" rows (Discovery
 * Phase 3). Same card-row shape as TeamInviteRow, but there's no Accept
 * here — the captain accepts, not me; I can only cancel.
 */
export function TeamRequestRow({ teamId, teamName, tag, viewerId }: { teamId: string; teamName: string; tag: string | null; viewerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    await fetch(`/api/teams/${teamId}/members/${viewerId}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card-row flex items-center gap-3 p-3">
      <Link href={`/teams/${teamId}`} className="min-w-0 flex-1">
        <span className="truncate font-medium">{teamName}</span>
        {tag && <span className="text-metadata ml-1.5">[{tag}]</span>}
      </Link>
      <button type="button" disabled={busy} onClick={cancel} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
        <Clock size={13} />
        Request Sent
      </button>
    </div>
  );
}
