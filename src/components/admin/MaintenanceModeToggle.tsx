"use client";

/**
 * Circuit — Settings > maintenance mode. Turning it on takes Circuit
 * offline for everyone but staff, so it asks first and is styled as the
 * dangerous action it is; turning it off is a single click. Server
 * errors are shown, never swallowed.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./ui";
import { ConfirmButton } from "./ui-client";

export function MaintenanceModeToggle({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: boolean): Promise<string | null> {
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maintenanceMode: next }),
    }).catch(() => null);
    if (!res?.ok) return ((await res?.json().catch(() => null))?.error as string) ?? "Couldn't change maintenance mode.";
    router.refresh();
    return null;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          Maintenance mode
          {enabled ? <StatusBadge tone="danger" dot>On</StatusBadge> : <StatusBadge tone="success">Off</StatusBadge>}
        </span>
        <span className="text-[12px] text-muted">{enabled ? "Only staff can use Circuit right now." : "Circuit is live for everyone."}</span>
        {error && <span className="text-[12px] text-danger">{error}</span>}
      </div>
      {enabled ? (
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={async () => {
            setBusy(true);
            setError(await set(false));
            setBusy(false);
          }}
          className="btn-secondary"
        >
          {busy ? "Turning off…" : "Turn off"}
        </button>
      ) : (
        <ConfirmButton
          label="Turn on"
          confirmLabel="Take Circuit offline"
          message="Everyone except staff is locked out until you turn it off. Live matches and payments pause for players."
          disabled={!canEdit}
          onConfirm={() => set(true)}
        />
      )}
    </div>
  );
}
