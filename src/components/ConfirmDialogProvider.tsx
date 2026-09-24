"use client";

/**
 * Circuit — replaces window.confirm() app-wide with Modal.tsx's styled
 * dialog, kept ergonomically identical to the native call it replaces:
 * `if (!(await confirmDialog({ title }))) return;` where every site
 * used to have `if (!confirm("...")) return;`. Mounted once at the root
 * (src/app/layout.tsx, wrapping AppShell so both the player app and the
 * bare-route admin section — which renders outside AppShell entirely,
 * see AppShell.tsx's own isBareRoute branch — can reach it) rather than
 * per-page, since confirmations are scattered across dozens of otherwise
 * unrelated components.
 */

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Modal } from "@/components/Modal";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red "Confirm" button + warning icon, vs. the neutral brand color —
   *  every confirmation this replaces (delete/cancel/remove/revoke/
   *  withdraw/disband) is destructive, so this defaults to true; pass
   *  `false` explicitly for a plain yes/no that isn't. */
  danger?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

export function useConfirmDialog(): ConfirmFn {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error("useConfirmDialog must be used within a ConfirmDialogProvider");
  return ctx;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirmDialog = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  }

  const danger = options?.danger !== false;

  return (
    <ConfirmDialogContext.Provider value={confirmDialog}>
      {children}
      <Modal
        open={!!options}
        onClose={() => settle(false)}
        variant={danger ? "warning" : "info"}
        title={options?.title ?? ""}
        message={options?.message}
        secondaryAction={{ label: options?.cancelLabel ?? "Cancel", onClick: () => settle(false) }}
        primaryAction={{ label: options?.confirmLabel ?? "Confirm", onClick: () => settle(true), danger }}
      />
    </ConfirmDialogContext.Provider>
  );
}
