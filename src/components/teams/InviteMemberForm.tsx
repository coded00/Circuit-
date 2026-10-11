"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerPicker, type PickedPlayer } from "./PlayerPicker";

export function InviteMemberForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function invite(player: PickedPlayer) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/teams/${teamId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: player.handle }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      return;
    }
    setNotice(`Invite sent to @${player.handle}.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <PlayerPicker teamId={teamId} onPick={invite} placeholder="Search a player to invite" />
      {error && <p className="field-error">{error}</p>}
      {notice && <p className="text-xs text-success">{notice}</p>}
    </div>
  );
}
