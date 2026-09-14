"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserCheck, UserX } from "lucide-react";

type Person = { handle: string; displayName: string; avatarUrl: string | null };

export function FriendRequestRow({
  friendshipId,
  person,
  kind,
}: {
  friendshipId: string;
  person: Person;
  kind: "incoming" | "outgoing" | "friend";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    await fetch(`/api/friends/${friendshipId}/accept`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function remove(confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true);
    await fetch(`/api/friends/${friendshipId}`, { method: "DELETE" });
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

      <div className="flex shrink-0 gap-2">
        {kind === "incoming" && (
          <>
            <button type="button" disabled={busy} onClick={accept} className="btn-primary px-3 py-1.5 text-xs">
              <UserCheck size={13} />
              Accept
            </button>
            <button type="button" disabled={busy} onClick={() => remove()} className="btn-secondary px-3 py-1.5 text-xs">
              <UserX size={13} />
              Decline
            </button>
          </>
        )}
        {kind === "outgoing" && (
          <button type="button" disabled={busy} onClick={() => remove()} className="btn-secondary px-3 py-1.5 text-xs">
            Cancel
          </button>
        )}
        {kind === "friend" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => remove(`Remove ${person.displayName} as a friend?`)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
