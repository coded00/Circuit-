"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";

type Person = { id: string; handle: string; displayName: string; avatarUrl: string | null };

export function MemberRow({
  teamId,
  person,
  isCaptain,
  isPending,
  canRemove,
}: {
  teamId: string;
  person: Person;
  isCaptain: boolean;
  isPending: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Remove ${person.displayName} from the team?`)) return;
    setBusy(true);
    await fetch(`/api/teams/${teamId}/members/${person.id}`, { method: "DELETE" });
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
      {isPending && <span className="badge badge-neutral shrink-0">Invited</span>}

      {canRemove && (
        <button type="button" disabled={busy} onClick={remove} aria-label="Remove" className="shrink-0 text-danger hover:opacity-70">
          <X size={15} />
        </button>
      )}
    </div>
  );
}
