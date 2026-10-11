"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { useToast } from "@/components/ToastProvider";
import { setBlocked } from "@/lib/blocksClient";

/** Block (or unblock) this player. See src/lib/blocks.ts for what a block does. */
export default function BlockButton({ handle, displayName, blocked }: { handle: string; displayName: string; blocked: boolean }) {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!blocked) {
      const yes = await confirmDialog({
        title: `Block @${handle}?`,
        message: `Neither of you will be able to send the other a friend request or a direct challenge, any friendship ends, and you won't see their chat messages. Matches you're already in carry on.`,
        confirmLabel: "Block",
        cancelLabel: "Cancel",
      });
      if (!yes) return;
    }
    setBusy(true);
    const ok = await setBlocked(handle, !blocked);
    setBusy(false);
    if (ok) {
      toast({ title: blocked ? `Unblocked @${handle}` : `Blocked @${handle}`, message: blocked ? undefined : `${displayName} can no longer send you requests or challenges.` });
      router.refresh();
    } else {
      toast({ title: "Couldn't do that", message: "Try again.", tone: "error" });
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} aria-label={blocked ? `Unblock ${displayName}` : `Block ${displayName}`} title={blocked ? "Unblock player" : "Block player"} className={`btn-icon ${blocked ? "text-danger" : "text-muted hover:text-foreground"}`}>
      <Ban size={16} />
    </button>
  );
}
