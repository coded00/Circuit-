"use client";

/**
 * Circuit — small pieces shared by the admin game builder: a JSON fetch
 * wrapper that surfaces the route's own error message, an on/off switch,
 * and up/down reorder buttons.
 */

import { ChevronDown, ChevronUp } from "lucide-react";

export async function catalogRequest(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return "Network error. Try again.";
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? "Something went wrong.";
}

export { Switch } from "@/components/ui/Switch";

export function ReorderButtons({
  onUp,
  onDown,
  disableUp,
  disableDown,
  label,
}: {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
  label: string;
}) {
  const cls =
    "flex h-5 w-6 items-center justify-center rounded text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent";
  return (
    <span className="flex shrink-0 flex-col">
      <button type="button" onClick={onUp} disabled={disableUp} aria-label={`Move ${label} up`} className={cls}>
        <ChevronUp size={14} />
      </button>
      <button type="button" onClick={onDown} disabled={disableDown} aria-label={`Move ${label} down`} className={cls}>
        <ChevronDown size={14} />
      </button>
    </span>
  );
}

export function StatusBadge({ enabled, labels = ["Active", "Inactive"] }: { enabled: boolean; labels?: [string, string] }) {
  return <span className={`badge ${enabled ? "badge-complete" : "badge-neutral"}`}>{enabled ? labels[0] : labels[1]}</span>;
}
