"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MaintenanceModeToggle({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function toggle() {
    setSubmitting(true);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maintenanceMode: !enabled }),
    });
    setSubmitting(false);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">Maintenance mode</span>
        <span className="text-xs text-muted">
          {enabled ? "On — only staff can browse Circuit right now." : "Off — Circuit is live for everyone."}
        </span>
      </div>
      <button
        type="button"
        disabled={!canEdit || submitting}
        onClick={toggle}
        className={enabled ? "btn-danger text-sm" : "btn-primary text-sm"}
      >
        {submitting ? "…" : enabled ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}
