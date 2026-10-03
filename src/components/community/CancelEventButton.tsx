"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

/** Moderators cancel a community event (it's announced in the community). */
export function CancelEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const confirm = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!(await confirm({ title: "Cancel this event?", message: "Everyone who RSVPed will see it's cancelled.", confirmLabel: "Cancel event" }))) return;
        setBusy(true);
        await fetch(`/api/community-events/${eventId}`, { method: "DELETE" }).catch(() => null);
        setBusy(false);
        router.refresh();
      }}
      className="btn-secondary h-10 px-4 text-sm text-danger"
    >
      Cancel event
    </button>
  );
}
