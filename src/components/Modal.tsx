"use client";

/**
 * Circuit — generic modal shell: success/error/warning/info variants,
 * primary/secondary actions (with an optional loading state on the
 * primary one), Escape/backdrop/X close, body-scroll lock. Same
 * portal-to-body + framer-motion backdrop pattern as NotificationBell's
 * own panel and QuickMatch's incoming-challenge modal — see
 * NotificationBell.tsx's own comment on why the portal is needed
 * (TopBar's backdrop-blur establishes a containing block that would
 * otherwise clip a plain `position: fixed` child to the header's own
 * height).
 *
 * The building block behind ConfirmDialogProvider.tsx's imperative
 * confirm() replacement for window.confirm() — used directly wherever a
 * one-off success/error/info modal (not a yes/no confirmation) is
 * needed instead.
 *
 * Portaling to document.body also means this escapes /admin's own
 * `data-surface="dark"` scope (globals.css's dark-mode override, applied
 * via that attribute on a wrapping div in admin/layout.tsx, not on
 * <html>/<body>) — without re-applying it here, a confirm dialog
 * triggered from the admin section would render with the light theme's
 * card while everything behind it stays dark. Same route-based check
 * AppShell.tsx already uses for admin-specific behavior.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Spinner } from "@/components/Spinner";

export type ModalVariant = "success" | "error" | "warning" | "info";

const VARIANT_ICON: Record<ModalVariant, { Icon: typeof AlertTriangle; className: string }> = {
  success: { Icon: CheckCircle2, className: "bg-success/15 text-success" },
  error: { Icon: XCircle, className: "bg-danger/15 text-danger" },
  warning: { Icon: AlertTriangle, className: "bg-warning/15 text-warning" },
  info: { Icon: Info, className: "bg-accent-blue-soft text-accent-blue" },
};

export type ModalAction = {
  label: string;
  onClick: () => void;
  loading?: boolean;
  /** Renders as `.btn-danger` instead of `.btn-primary` — for a destructive primary action. */
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-time post-mount flag to gate the portal target (document.body), not a data-fetch/subscription effect
    setMounted(true);
  }, []);

  const pathname = usePathname();
  const isAdminSurface = pathname.startsWith("/admin");

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Same "the backdrop dims the page but doesn't stop scroll" fix
  // NotificationBell's panel needed — a modal sitting on top of
  // scrollable content should feel modal, not like an overlay you can
  // scroll straight past.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const { Icon, className: iconClassName } = VARIANT_ICON[variant];

  return (
    mounted &&
    createPortal(
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="modal-backdrop"
              className="fixed inset-0 z-40 bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={onClose}
            />
            <motion.div
              key="modal-panel"
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={onClose}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                data-surface={isAdminSurface ? "dark" : undefined}
                className="card relative w-full max-w-[400px] p-6"
                style={{ boxShadow: "0 16px 40px rgba(0, 0, 0, 0.45)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <button type="button" onClick={onClose} aria-label="Close" className="btn-icon absolute top-3 right-3">
                  <X size={16} className="text-muted" />
                </button>

                <div className="flex flex-col items-center gap-3 pt-1 text-center">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconClassName}`}>
                    <Icon size={24} />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold">{title}</h2>
                    {message && <p className="text-sm text-muted">{message}</p>}
                  </div>
                </div>

                {children}

                {(primaryAction || secondaryAction) && (
                  <div className="mt-5 flex gap-2">
                    {secondaryAction && (
                      <button type="button" onClick={secondaryAction.onClick} className="btn-secondary flex-1 justify-center">
                        {secondaryAction.label}
                      </button>
                    )}
                    {primaryAction && (
                      <button
                        type="button"
                        onClick={primaryAction.onClick}
                        disabled={primaryAction.loading}
                        className={`flex-1 justify-center ${primaryAction.danger ? "btn-danger" : "btn-primary"}`}
                      >
                        {primaryAction.loading && <Spinner />}
                        {primaryAction.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
    )
  );
}
