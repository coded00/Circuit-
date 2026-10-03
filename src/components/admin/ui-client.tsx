"use client";

/**
 * Circuit — interactive parts of the admin UI kit (see ui.tsx).
 * - RowLink: makes a table row open its detail page on click, while the
 *   row's name stays a real link for keyboard and screen-reader users.
 * - ConfirmButton: a button that asks before doing something heavy
 *   (suspend, freeze, maintenance mode, cancel) — inline, no modal.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RowLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      data-href={href}
      className={className}
      onClick={(e) => {
        // Let real links/buttons inside the row do their own thing.
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

export function ConfirmButton({
  label,
  confirmLabel,
  message,
  onConfirm,
  tone = "danger",
  disabled = false,
  size = "md",
}: {
  label: React.ReactNode;
  /** The button inside the confirmation, e.g. "Yes, suspend". */
  confirmLabel: string;
  message: React.ReactNode;
  onConfirm: () => Promise<string | null | void>;
  tone?: "danger" | "neutral";
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = tone === "danger" ? "btn-danger" : "btn-secondary";
  const small = size === "sm" ? "!min-h-8 !px-2.5 !text-[12px]" : "";

  if (!open) {
    return (
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={`${trigger} ${small}`}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex max-w-sm flex-col gap-2 rounded-[8px] border border-border-strong bg-surface-elevated p-3 text-left">
      <p className="text-[13px] text-foreground">{message}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const err = await onConfirm();
            setBusy(false);
            if (err) setError(err);
            else setOpen(false);
          }}
          className={tone === "danger" ? "btn-danger-solid" : "btn-primary"}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
