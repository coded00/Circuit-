"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/admin/ui-client";

/**
 * Circuit — the staff buttons on a Daily Challenge: publish, pause, resume, cancel, delete.
 *
 * Which ones appear is decided by the page from the challenge's state; every one is checked again on the
 * server, so a stale page can only produce an error message, never a wrong state change. Pause and cancel need
 * a reason — it goes in the audit log and is what staff will want to read back later.
 */

async function call(path: string, method: string, body?: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: data?.error ?? "Something went wrong." };
  return { ok: true, data: data ?? {} };
}

function ReasonField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={300} placeholder={placeholder} className="field-input mt-2 w-full" />;
}

export function DailyChallengeActions({
  id,
  status,
  paused,
  canPause,
  canCancel,
  enabled,
}: {
  id: string;
  status: string;
  paused: boolean;
  canPause: boolean;
  canCancel: boolean;
  /** The platform switch. Publishing is refused while it is off; the button says so rather than hiding. */
  enabled: boolean;
}) {
  const router = useRouter();
  const [pauseReason, setPauseReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const base = `/api/admin/challenges/daily/${id}`;

  async function act(path: string, method = "POST", body?: Record<string, unknown>): Promise<string | null> {
    setNotice(null);
    const r = await call(path, method, body);
    if (!r.ok) return r.error;
    if (typeof r.data.shiftedMinutes === "number") setNotice(r.data.shiftedMinutes > 0 ? `Resumed. Deadlines still ahead moved ${r.data.shiftedMinutes} minute${r.data.shiftedMinutes === 1 ? "" : "s"} later.` : "Resumed.");
    return null;
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {status === "DRAFT" && (
        <>
          <ConfirmButton
            label="Publish"
            confirmLabel="Yes, publish"
            tone="neutral"
            disabled={!enabled}
            message={
              <>
                Publishing makes this challenge visible and takes the rules, fee and prize split as final — a published challenge can only be paused or cancelled.
                {!enabled && " Daily Challenges are switched off in Settings."}
              </>
            }
            onConfirm={async () => {
              const err = await act(`${base}/publish`);
              if (!err) router.refresh();
              return err;
            }}
          />
          <ConfirmButton
            label="Delete draft"
            confirmLabel="Yes, delete"
            message="This draft is deleted for good."
            onConfirm={async () => {
              const err = await act(base, "DELETE");
              if (!err) router.push("/admin/challenges?kind=daily");
              return err;
            }}
          />
        </>
      )}

      {canPause && !paused && (
        <ConfirmButton
          label="Pause"
          confirmLabel="Yes, pause"
          tone="neutral"
          message={
            <>
              Nobody can enter or submit while it&apos;s paused and the clock stops advancing. Say why:
              <ReasonField value={pauseReason} onChange={setPauseReason} placeholder="e.g. The game's servers are down" />
            </>
          }
          onConfirm={async () => {
            const err = await act(`${base}/pause`, "POST", { reason: pauseReason });
            if (!err) {
              setPauseReason("");
              router.refresh();
            }
            return err;
          }}
        />
      )}

      {paused && (
        <ConfirmButton
          label="Resume"
          confirmLabel="Yes, resume"
          tone="neutral"
          message="Deadlines that hadn't passed yet will move later by as long as the pause lasted. Deadlines already behind stay closed."
          onConfirm={async () => {
            const err = await act(`${base}/resume`);
            if (!err) router.refresh();
            return err;
          }}
        />
      )}

      {canCancel && (
        <ConfirmButton
          label="Cancel challenge"
          confirmLabel="Yes, cancel it"
          message={
            <>
              This ends the challenge for good and cannot be undone. Say why — players will see it:
              <ReasonField value={cancelReason} onChange={setCancelReason} placeholder="e.g. Not enough players entered" />
            </>
          }
          onConfirm={async () => {
            const err = await act(`${base}/cancel`, "POST", { reason: cancelReason });
            if (!err) {
              setCancelReason("");
              router.refresh();
            }
            return err;
          }}
        />
      )}
      {notice && <p className="w-full text-[12px] text-muted">{notice}</p>}
    </div>
  );
}
