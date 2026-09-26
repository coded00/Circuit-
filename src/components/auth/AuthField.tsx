"use client";

/**
 * Circuit — an auth form field: label, a leading icon, the input, an
 * optional trailing control, and a hint or status line. `PasswordField`
 * adds a show/hide toggle.
 */

import { useId, useState } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

export function AuthField({
  label,
  icon: Icon,
  trailing,
  hint,
  hintTone = "muted",
  labelAside,
  ...input
}: {
  label: string;
  icon: LucideIcon;
  trailing?: React.ReactNode;
  hint?: React.ReactNode;
  hintTone?: "muted" | "ok" | "error";
  /** e.g. a "Forgot password?" link on the label row. */
  labelAside?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const id = input.id ?? generated;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-semibold text-foreground/90">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="group relative flex items-center">
        <Icon size={17} className="pointer-events-none absolute left-3.5 text-muted-strong transition-colors group-focus-within:text-accent-volt" aria-hidden />
        <input
          {...input}
          id={id}
          className={`h-12 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] pl-11 text-[15px] text-foreground outline-none transition placeholder:text-muted-strong hover:border-white/[0.14] focus:border-accent-volt/70 focus:bg-white/[0.06] focus:ring-4 focus:ring-accent-volt/10 ${
            trailing ? "pr-12" : "pr-4"
          }`}
        />
        {trailing && <div className="absolute right-1.5">{trailing}</div>}
      </div>
      {hint && (
        <p className={`text-xs ${hintTone === "ok" ? "text-success" : hintTone === "error" ? "text-danger" : "text-muted"}`} aria-live="polite">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: Omit<React.ComponentProps<typeof AuthField>, "type" | "trailing">) {
  const [shown, setShown] = useState(false);
  return (
    <AuthField
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted transition hover:bg-white/[0.06] hover:text-foreground"
        >
          {shown ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      }
    />
  );
}
