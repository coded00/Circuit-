"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Check } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

type Person = { id: string; handle: string; displayName: string; avatarUrl: string | null };

export function MemberRow({
  teamId,
  person,
  isCaptain,
  isPending,
  isJoinRequest = false,
  canRemove,
  canAccept = false,
}: {
  teamId: string;
  person: Person;
  isCaptain: boolean;
  isPending: boolean;
  /** True for a member-initiated "request to join" row — false (default) is the original captain-invited-a-handle row. See TeamMembership.requestedByMember. */
  isJoinRequest?: boolean;
  canRemove: boolean;
  /** Only meaningful alongside isJoinRequest — the captain can accept a join request (an invite instead waits on the invitee, not the captain). */
  canAccept?: boolean;
}) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!(await confirmDialog({ title: `Remove ${person.displayName} from the team?`, confirmLabel: "Remove" }))) return;
    setBusy(true);
    await fetch(`/api/teams/${teamId}/members/${person.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  async function accept() {
    setBusy(true);
    await fetch(`/api/teams/${teamId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: person.id }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="card-row flex items-center gap-3 p-3">
      <Link href={`/players/${person.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
        {person.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
          <img src={person.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full border border-border object-cover" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated font-semibold text-muted">
            {person.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{person.displayName}</span>
          <span className="text-metadata">@{person.handle}</span>
        </div>
      </Link>

      {isCaptain && <span className="badge badge-brand shrink-0">Captain</span>}
      {isPending && <span className="badge badge-neutral shrink-0">{isJoinRequest ? "Wants to join" : "Invited"}</span>}

      {canAccept && (
        <button type="button" disabled={busy} onClick={accept} aria-label="Accept" className="shrink-0 text-success hover:opacity-70">
          <Check size={16} />
        </button>
      )}
      {canRemove && (
        <button type="button" disabled={busy} onClick={remove} aria-label="Remove" className="shrink-0 text-danger hover:opacity-70">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
