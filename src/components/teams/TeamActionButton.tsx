"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

/** Renders a "Leave team" (member) or "Disband team" (captain) action —
 *  never both, since a captain can't leave without disbanding (see
 *  `Team`'s own schema comment). */
export function TeamActionButton({ teamId, userId, kind }: { teamId: string; userId: string; kind: "leave" | "disband" }) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [busy, setBusy] = useState(false);

  async function act() {
    const confirmed = await confirmDialog(
      kind === "disband"
        ? { title: "Disband this team?", message: "This removes every member.", confirmLabel: "Disband team" }
        : { title: "Leave this team?", confirmLabel: "Leave team" }
    );
    if (!confirmed) return;
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
