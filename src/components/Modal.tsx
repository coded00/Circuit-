"use client";

/**
 * Circuit — generic modal: success/error/warning/info variants,
 * primary/secondary actions (optional loading state on the primary),
 * Escape/backdrop/X close. Sits in ui/Overlay.tsx's DialogOverlay, so it
 * is a bottom sheet on phones and a centred dialog from `sm` up.
 *
 * Left-aligned header (icon chip beside the title, not a big centred
 * circle over it) with the actions in their own footer strip — reads as
 * a product dialog rather than a stock alert.
 *
 * The building block behind ConfirmDialogProvider.tsx's imperative
 * confirm() replacement for window.confirm() — used directly wherever a
 * one-off success/error/info modal (not a yes/no confirmation) is
 * needed instead.
 */

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { DialogOverlay } from "@/components/ui/Overlay";

export type ModalVariant = "success" | "error" | "warning" | "info";

const VARIANT_ICON: Record<ModalVariant, { Icon: typeof AlertTriangle; className: string }> = {
  success: { Icon: CheckCircle2, className: "bg-success/12 text-success" },
  error: { Icon: XCircle, className: "bg-danger/12 text-danger" },
  warning: { Icon: AlertTriangle, className: "bg-warning/15 text-warning-strong" },
  info: { Icon: Info, className: "bg-accent-blue-soft text-accent-blue" },
};

export type ModalAction = {
  label: string;
  onClick: () => void;
  loading?: boolean;
  /** Solid red instead of `.btn-primary` — for a destructive primary action. */
  danger?: boolean;
};

export function Modal({
  open,
  onClose,
  variant = "info",
  title,
  message,
  primaryAction,
  secondaryAction,
  children,
}: {
  open: boolean;
  onClose: () => void;
  variant?: ModalVariant;
  title: string;
  message?: string;
  primaryAction?: ModalAction;
  secondaryAction?: ModalAction;
  children?: React.ReactNode;
}) {
  const { Icon, className: iconClassName } = VARIANT_ICON[variant];

  return (
    <DialogOverlay open={open} onClose={onClose} label={title} maxWidth={440}>
      <div className="relative flex flex-col gap-4 overflow-y-auto px-5 pt-2 pb-5 sm:px-6 sm:pt-6">
        <button type="button" onClick={onClose} aria-label="Close" className="btn-icon absolute top-2 right-2 hidden h-9 w-9 sm:inline-flex">
          <X size={16} />
        </button>

        <div className="flex items-start gap-3.5 sm:pr-8">
          <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] ${iconClassName}`}>
            <Icon size={20} strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-[17px] leading-snug font-bold tracking-tight">{title}</h2>
            {message && <p className="text-sm leading-relaxed text-muted">{message}</p>}
          </div>
        </div>

        {children}
      </div>

      {(primaryAction || secondaryAction) && (
        <div className="overlay-actions">
          {secondaryAction && (
            <button type="button" onClick={secondaryAction.onClick} className="btn-secondary">
              {secondaryAction.label}
            </button>
          )}
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.loading}
              className={primaryAction.danger ? "btn-danger-solid" : "btn-primary"}
            >
              {primaryAction.loading && <Spinner />}
              {primaryAction.label}
            </button>
          )}
        </div>
      )}
    </DialogOverlay>
  );
}
