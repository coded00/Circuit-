"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { useToast } from "@/components/ToastProvider";
import { setBlocked } from "@/lib/blocksClient";

type Blocked = { id: string; handle: string; displayName: string; avatarUrl: string | null };

export default function BlockedList({ blocked }: { blocked: Blocked[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function unblock(person: Blocked) {
    setBusy(person.id);
    const ok = await setBlocked(person.handle, false);
    setBusy(null);
    if (ok) {
      toast({ title: `Unblocked @${person.handle}`, message: "They can send you friend requests and challenges again." });
      router.refresh();
    } else {
      toast({ title: "Couldn't unblock", message: "Try again.", tone: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold">What blocking does</h2>
        <ul className="ml-4 list-disc space-y-1 text-sm text-muted">
          <li>Neither of you can send the other a friend request or a direct challenge, and an existing friendship ends.</li>
          <li>You won&apos;t see their messages in community chats.</li>
          <li>You won&apos;t come up in each other&apos;s Discover or Quick Match.</li>
          <li>Matches and tournaments you&apos;re both already in carry on as normal.</li>
        </ul>
      </div>

      {blocked.length === 0 ? (
        <p className="card text-sm text-muted">You haven&apos;t blocked anyone. You can block a player from the button on their profile.</p>
      ) : (
        <ul className="card divide-y divide-border overflow-hidden p-0">
          {blocked.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-3.5">
              <PlayerAvatar person={p} size="sm" />
              <Link href={`/players/${p.handle}`} className="flex min-w-0 flex-1 flex-col hover:underline">
                <span className="truncate text-sm font-semibold">{p.displayName}</span>
                <span className="truncate text-xs text-muted">@{p.handle}</span>
              </Link>
              <button type="button" onClick={() => unblock(p)} disabled={busy === p.id} className="btn-secondary h-9 px-4 text-sm">
                {busy === p.id ? "Unblocking…" : "Unblock"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
