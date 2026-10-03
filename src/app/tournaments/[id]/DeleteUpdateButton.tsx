"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { useToast } from "@/components/ToastProvider";

export default function DeleteUpdateButton({ tournamentId, updateId }: { tournamentId: string; updateId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirmDialog();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!(await confirmDialog({ title: "Delete this update?", confirmLabel: "Delete", cancelLabel: "Keep it" }))) return;
    setBusy(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/updates/${updateId}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      toast({ title: "Update deleted" });
      router.refresh();
    } else {
      toast({ title: "Couldn't delete the update", message: "Try again.", tone: "error" });
    }
  }

  return (
    <button type="button" onClick={remove} disabled={busy} aria-label="Delete update" title="Delete update" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-elevated hover:text-danger">
      <Trash2 size={14} />
    </button>
  );
}
