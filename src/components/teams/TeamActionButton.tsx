"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Trash2 } from "lucide-react";

/** Renders a "Leave team" (member) or "Disband team" (captain) action —
 *  never both, since a captain can't leave without disbanding (see
 *  `Team`'s own schema comment). */
export function TeamActionButton({ teamId, userId, kind }: { teamId: string; userId: string; kind: "leave" | "disband" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act() {
    const message = kind === "disband" ? "Disband this team? This removes every member." : "Leave this team?";
    if (!confirm(message)) return;
    setBusy(true);
    if (kind === "disband") {
      await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      router.push("/teams");
    } else {
      await fetch(`/api/teams/${teamId}/members/${userId}`, { method: "DELETE" });
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <button type="button" disabled={busy} onClick={act} className="btn-secondary text-danger">
      {kind === "disband" ? <Trash2 size={13} /> : <LogOut size={13} />}
      {kind === "disband" ? "Disband Team" : "Leave Team"}
    </button>
  );
}
