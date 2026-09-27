"use client";

/** Circuit — staff decide appeals against account and community suspensions. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type AppealRow = {
  id: string;
  kind: "ACCOUNT_SUSPENSION" | "COMMUNITY_SUSPENSION";
  message: string;
  createdAt: string;
  user: { handle: string; displayName: string; suspensionReason: string | null };
  community: { name: string; href: string; suspensionReason: string | null } | null;
};

export function AppealQueue({ appeals }: { appeals: AppealRow[] }) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, overturn: boolean) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/appeals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overturn, response: responses[id] ?? "" }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError((await res?.json().catch(() => null))?.error ?? "Couldn't save that decision.");
    router.refresh();
  }

  if (appeals.length === 0) return <p className="card text-center text-muted">No open appeals.</p>;
  return (
    <div className="flex flex-col gap-3">
      {appeals.map((a) => (
        <div key={a.id} className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="badge badge-neutral">{a.kind === "ACCOUNT_SUSPENSION" ? "Account" : "Community"}</span>
            <Link href={`/players/${a.user.handle}`} className="font-medium hover:underline">
              {a.user.displayName} (@{a.user.handle})
            </Link>
            {a.community && (
              <>
                <span className="text-muted">for</span>
                <Link href={a.community.href} className="font-medium hover:underline">
                  {a.community.name}
                </Link>
              </>
            )}
          </div>
          <p className="text-xs text-muted">Suspended for: {(a.community?.suspensionReason ?? a.user.suspensionReason) || "no reason recorded"}</p>
          <blockquote className="rounded-[10px] border-l-2 border-border-strong bg-surface-elevated/50 px-3 py-2 text-sm whitespace-pre-line">{a.message}</blockquote>
          <textarea
            value={responses[a.id] ?? ""}
            onChange={(e) => setResponses((r) => ({ ...r, [a.id]: e.target.value }))}
            placeholder="Response to them (optional, shown in their notification)"
            rows={2}
            maxLength={500}
            className="field-input resize-none"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy !== null} onClick={() => decide(a.id, true)} className="btn-primary h-9 px-4 text-sm">
              Overturn &amp; restore
            </button>
            <button type="button" disabled={busy !== null} onClick={() => decide(a.id, false)} className="btn-secondary h-9 px-4 text-sm">
              Uphold
            </button>
          </div>
        </div>
      ))}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
