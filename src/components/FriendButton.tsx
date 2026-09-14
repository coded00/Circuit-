"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck, UserX, Clock } from "lucide-react";

export type FriendButtonStatus =
  | { state: "none" }
  | { state: "friends"; friendshipId: string }
  | { state: "outgoing"; friendshipId: string }
  | { state: "incoming"; friendshipId: string };

export function FriendButton({ targetHandle, status }: { targetHandle: string; status: FriendButtonStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sendRequest() {
    setBusy(true);
    await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: targetHandle }),
    });
    setBusy(false);
    router.refresh();
  }

  async function accept(id: string) {
    setBusy(true);
    await fetch(`/api/friends/${id}/accept`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  async function remove(id: string, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true);
    await fetch(`/api/friends/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  if (status.state === "friends") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => remove(status.friendshipId, `Remove ${targetHandle} as a friend?`)}
        className="btn-secondary"
      >
        <UserCheck size={13} />
        Friends
      </button>
    );
  }

  if (status.state === "outgoing") {
    return (
      <button type="button" disabled={busy} onClick={() => remove(status.friendshipId)} className="btn-secondary">
        <Clock size={13} />
        Request Sent
      </button>
    );
  }

  if (status.state === "incoming") {
    return (
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => accept(status.friendshipId)} className="btn-primary">
          <UserCheck size={13} />
          Accept
        </button>
        <button type="button" disabled={busy} onClick={() => remove(status.friendshipId)} className="btn-secondary">
          <UserX size={13} />
          Decline
        </button>
      </div>
    );
  }

  return (
    <button type="button" disabled={busy} onClick={sendRequest} className="btn-secondary">
      <UserPlus size={13} />
      Add Friend
    </button>
  );
}
