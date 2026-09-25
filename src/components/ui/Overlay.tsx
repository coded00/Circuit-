"use client";

/**
 * Circuit — the one overlay shell every modal-shaped surface sits in
 * (Modal/confirm dialogs, the incoming Quick Match request, the mobile
 * notifications sheet). Before this, each of those hand-rolled its own
 * portal + bg-black/60 backdrop + scale-in card, which is why they all
 * read like the same stock template.
 *
 * Phones get a bottom sheet (anchored to the thumb edge, grab handle,
 * slides up); sm+ gets a centred dialog that rises in. Same markup, one
 * breakpoint switch — see useIsDesktop below.
 *
 * Portaled to document.body: TopBar's backdrop-blur creates a containing
 * block that would otherwise clip `position: fixed` children to the
 * header's height. That also escapes /admin's `data-surface="dark"`
 * wrapper, so the admin check re-applies it on the panel itself.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls } from "framer-motion";

const DESKTOP_QUERY = "(min-width: 640px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** `sm` and up. Server snapshot is `true` — nothing renders open on the
 *  server anyway, so the value only matters after mount. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true
  );
}

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount flag gating the document.body portal target
    setMounted(true);
  }, []);
  return mounted;
}

/** Escape-to-close + body scroll lock while `open`. */
export function useOverlayBehaviour(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);
}

const SHEET_EASE = [0.32, 0.72, 0, 1] as const;

export function DialogOverlay({
  open,
  onClose,
  label,
  children,
  maxWidth = 440,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  /** Desktop dialog width in px. The phone sheet is always full-width. */
  maxWidth?: number;
  /** False for interrupting prompts (Quick Match) that must be answered, not tapped away. */
  dismissible?: boolean;
}) {
  const mounted = useMounted();
  const isDesktop = useIsDesktop();
  const isAdminSurface = usePathname().startsWith("/admin");
  // Drag starts from the grab handle only, so scrolling a long sheet's
  // content never fights the swipe-to-dismiss gesture.
  const dragControls = useDragControls();
  useOverlayBehaviour(open, dismissible ? onClose : () => {});

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div key="overlay" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="overlay-backdrop absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            data-surface={isAdminSurface ? "dark" : undefined}
            className="overlay-panel relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[20px] sm:max-h-[80vh] sm:rounded-[16px]"
            style={isDesktop ? { maxWidth } : undefined}
            initial={isDesktop ? { opacity: 0, y: 12, scale: 0.98 } : { y: "100%" }}
            animate={isDesktop ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, y: 8, scale: 0.98 } : { y: "100%" }}
            transition={isDesktop ? { duration: 0.22, ease: [0.16, 1, 0.3, 1] } : { duration: 0.36, ease: SHEET_EASE }}
            drag={!isDesktop && dismissible ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
          >
            {dismissible && (
              <div
                aria-hidden
                onPointerDown={(e) => dragControls.start(e)}
                className="flex shrink-0 touch-none justify-center pt-2.5 pb-1.5 sm:hidden"
              >
                <span className="h-1 w-9 rounded-full bg-border-strong" />
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
