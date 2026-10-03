"use client";

/**
 * Circuit — action feedback. A short message that appears when something
 * the player did has worked (or hasn't): "Result submitted", "Challenge
 * accepted". Mounted once at the root so a toast survives the page refresh
 * or navigation that usually follows the action. Polite for screen readers,
 * dismissible, gone after a few seconds, and never the only place an error
 * shows (forms keep their own inline messages).
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
type ToastInput = { title: string; message?: string; tone?: Tone };
type ToastItem = ToastInput & { id: number; tone: Tone };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const VISIBLE_MS = 5000;
const MAX_VISIBLE = 3;

const TONE: Record<Tone, { Icon: typeof Check; chip: string }> = {
  success: { Icon: Check, chip: "bg-accent-volt text-accent-volt-foreground" },
  error: { Icon: AlertCircle, chip: "bg-danger text-white" },
  info: { Icon: Info, chip: "bg-surface-elevated text-foreground" },
};

export function useToast(): (toast: ToastInput) => void {
  const ctx = useContext(ToastContext);
  // Outside the provider (a test, an isolated render) a toast is simply dropped.
  return ctx ?? (() => undefined);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), { ...input, id, tone: input.tone ?? "success" }]);
      timers.current.set(id, setTimeout(() => dismiss(id), VISIBLE_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Above the phone tab bar; bottom-right on larger screens. */}
      <div
        aria-live="polite"
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end sm:px-0"
      >
        {toasts.map((t) => {
          const { Icon, chip } = TONE[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[14px] border border-border-strong bg-surface p-3.5 shadow-lg">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${chip}`}>
                <Icon size={15} strokeWidth={2.5} aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold">{t.title}</span>
                {t.message && <span className="text-[13px] leading-snug text-muted">{t.message}</span>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-foreground">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
