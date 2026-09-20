"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserCheck, UserX } from "lucide-react";

export function TeamInviteRow({
  teamId,
  teamName,
  tag,
  viewerId,
}: {
  teamId: string;
  teamName: string;
  tag: string | null;
  viewerId: string;
}) {
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
    router.refresh();
  }

  return (
    <div className="card-row flex items-center gap-3 p-3">
      <Link href={`/teams/${teamId}`} className="min-w-0 flex-1">
        <span className="truncate font-medium">{teamName}</span>
        {tag && <span className="text-metadata ml-1.5">[{tag}]</span>}
      </Link>
      <div className="flex shrink-0 gap-2">
        <button type="button" disabled={busy} onClick={accept} className="btn-primary px-3 py-1.5 text-xs">
          <UserCheck size={14} />
          Accept
        </button>
        <button type="button" disabled={busy} onClick={decline} className="btn-secondary px-3 py-1.5 text-xs">
          <UserX size={14} />
          Decline
        </button>
      </div>
    </div>
  );
}
