"use client";

/**
 * Circuit — email signup as a three-step form, so no single screen is a
 * wall of fields:
 *   1. Account  — email, password, confirm password
 *   2. Gamer tag — username (live availability), Nigerian phone number
 *   3. Birthday — date of birth (13+ to join)
 * Each step is checked before moving on; the server re-validates all of
 * it and, if it rejects something, names the field so we jump back to
 * that step.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, AtSign, CalendarDays, Check, Lock, Phone, UserRound, X } from "lucide-react";
import { safeNextPath } from "@/lib/safeRedirect";
import { HANDLE_PATTERN } from "@/lib/handles";
import { formatNigerianPhone, normalizeNigerianPhone } from "@/lib/phone";
import { AuthField, PasswordField } from "@/components/auth/AuthField";
import { Spinner } from "@/components/Spinner";

const MIN_PASSWORD = 8;
const MIN_AGE = 13;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const STEPS = [
  { key: "account", title: "Your account", fields: ["email", "password", "confirmPassword"] },
  { key: "tag", title: "Your gamer tag", fields: ["handle", "phone"] },
  { key: "birthday", title: "Your birthday", fields: ["dateOfBirth"] },
] as const;
type Field = (typeof STEPS)[number]["fields"][number];

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function yearsAgo(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}
function ageFrom(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

type HandleStatus = { state: "idle" | "checking" | "available" | "taken" | "invalid"; message?: string };

export default function SignupForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ email: "", password: "", confirmPassword: "", handle: "", phone: "", dateOfBirth: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** The server's answer, and which username it was for. */
  const [handleCheck, setHandleCheck] = useState<{ handle: string; available: boolean; reason?: string } | null>(null);
  const firstFieldRef = useRef<HTMLDivElement>(null);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = field === "handle" ? e.target.value.toLowerCase() : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const formRef = useRef<HTMLFormElement>(null);

  // On each step change: bring the step into view (on phones the heading
  // and Google button above can push it below the fold), then focus its
  // first field.
  useEffect(() => {
    if (step > 0) formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    firstFieldRef.current?.querySelector("input")?.focus({ preventScroll: step > 0 });
  }, [step]);

  // Live username availability, debounced. Status is derived below from
  // whether the latest answer is for the username currently typed.
  useEffect(() => {
    const handle = values.handle;
    if (!HANDLE_PATTERN.test(handle)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/handle-available?handle=${encodeURIComponent(handle)}`, { signal: controller.signal });
        const data = await res.json();
        setHandleCheck({ handle, available: !!data.available, reason: data.reason });
      } catch {
        // Aborted (typing) or offline — the final submit still checks.
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values.handle]);

  const handleStatus: HandleStatus = !values.handle
    ? { state: "idle" }
    : !HANDLE_PATTERN.test(values.handle)
      ? { state: "invalid", message: "3–20 letters, numbers or underscores." }
      : handleCheck?.handle !== values.handle
        ? { state: "checking" }
        : handleCheck.available
          ? { state: "available" }
          : { state: "taken", message: handleCheck.reason };

  function validate(field: Field): string | undefined {
    const v = values;
    switch (field) {
      case "email":
        return EMAIL_PATTERN.test(v.email.trim()) ? undefined : "Enter a valid email address.";
      case "password":
        return v.password.length >= MIN_PASSWORD ? undefined : `Use at least ${MIN_PASSWORD} characters.`;
      case "confirmPassword":
        return v.confirmPassword === v.password ? undefined : "Passwords don't match.";
      case "handle":
        if (!HANDLE_PATTERN.test(v.handle)) return "3–20 letters, numbers or underscores.";
        return handleStatus.state === "taken" ? (handleStatus.message ?? "That username is taken.") : undefined;
      case "phone":
        return normalizeNigerianPhone(v.phone) ? undefined : "Enter a Nigerian mobile number, e.g. 0803 123 4567.";
      case "dateOfBirth": {
        const age = ageFrom(v.dateOfBirth);
        if (age === null) return "Enter your date of birth.";
        if (age < 0 || age > 120) return "Enter your real date of birth.";
        return age < MIN_AGE ? `You need to be at least ${MIN_AGE} to join Circuit.` : undefined;
      }
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const stepErrors = Object.fromEntries(STEPS[step].fields.map((f) => [f, validate(f)]).filter(([, e]) => e));
    if (Object.keys(stepErrors).length > 0) return setErrors((errs) => ({ ...errs, ...stepErrors }));
    if (step === 1 && handleStatus.state === "checking") return; // wait for the availability answer
    if (step < STEPS.length - 1) return setStep(step + 1);

    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
    } catch {
      setFormError("We couldn't reach Circuit. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const field = data?.field as Field | undefined;
      const message = data?.error ?? "Something went wrong. Please try again.";
      if (field) {
        setStep(STEPS.findIndex((s) => (s.fields as readonly string[]).includes(field)));
        setErrors({ [field]: message });
      } else {
        setFormError(message);
      }
      setSubmitting(false);
      return;
    }
    // replace, not push: Back from here must not return to the auth form.
    // New accounts go through onboarding first, then on to `next`.
    router.replace(`/welcome?next=${encodeURIComponent(next)}`);
    router.refresh();
  }

  const phoneNormalized = normalizeNigerianPhone(values.phone);
  const passwordProgress = Math.min(1, values.password.length / MIN_PASSWORD);
  const age = ageFrom(values.dateOfBirth);
  const current = STEPS[step];

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex scroll-mt-6 flex-col gap-5">
      <div className="flex flex-col gap-2.5" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{current.title}</span>
          <span className="font-mono text-[11px] text-muted-strong tabular-nums">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.key} className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent-volt" : "bg-white/[0.08]"}`} />
          ))}
        </div>
      </div>

      <div key={step} ref={firstFieldRef} className="motion-slide-up flex flex-col gap-4">
        {step === 0 && (
          <>
            <AuthField
              id="email"
              label="Email"
              icon={AtSign}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@example.com"
              value={values.email}
              onChange={set("email")}
              hint={errors.email}
              hintTone="error"
            />
            <div className="flex flex-col gap-2">
              <PasswordField id="password" label="Password" icon={Lock} autoComplete="new-password" value={values.password} onChange={set("password")} hint={errors.password} hintTone="error" />
              <div className="flex items-center gap-2.5" aria-hidden>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-[width,background-color] duration-300 ${passwordProgress >= 1 ? "bg-accent-volt" : "bg-white/30"}`}
                    style={{ width: `${passwordProgress * 100}%` }}
                  />
                </div>
                <span className={`font-mono text-[11px] tabular-nums ${passwordProgress >= 1 ? "text-accent-volt" : "text-muted-strong"}`}>
                  {passwordProgress >= 1 ? "Good to go" : `${values.password.length}/${MIN_PASSWORD}`}
                </span>
              </div>
            </div>
            <PasswordField
              id="confirmPassword"
              label="Confirm password"
              icon={Lock}
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={set("confirmPassword")}
              hint={errors.confirmPassword ?? (values.confirmPassword && values.confirmPassword === values.password ? "Passwords match" : undefined)}
              hintTone={errors.confirmPassword ? "error" : "ok"}
            />
          </>
        )}

        {step === 1 && (
          <>
            <AuthField
              id="handle"
              label="Username"
              icon={UserRound}
              maxLength={20}
              autoComplete="nickname"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. tobiking"
              value={values.handle}
              onChange={set("handle")}
              trailing={
                <span className="flex h-9 w-9 items-center justify-center" aria-hidden>
                  {handleStatus.state === "checking" && <Spinner size={15} className="text-muted" />}
                  {handleStatus.state === "available" && <Check size={17} className="text-success" />}
                  {(handleStatus.state === "taken" || handleStatus.state === "invalid") && <X size={17} className="text-danger" />}
                </span>
              }
              hint={
                errors.handle ??
                (handleStatus.state === "available"
                  ? `@${values.handle} is yours`
                  : handleStatus.state === "taken" || handleStatus.state === "invalid"
                    ? handleStatus.message
                    : "Your public @name. 3–20 letters, numbers or underscores.")
              }
              hintTone={errors.handle || handleStatus.state === "taken" || handleStatus.state === "invalid" ? "error" : handleStatus.state === "available" ? "ok" : "muted"}
            />
            <AuthField
              id="phone"
              label="Phone number"
              icon={Phone}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="0803 123 4567"
              value={values.phone}
              onChange={set("phone")}
              hint={errors.phone ?? (phoneNormalized ? `Saved as ${formatNigerianPhone(phoneNormalized)} · you can log in with it` : "Nigerian mobile number.")}
              hintTone={errors.phone ? "error" : phoneNormalized ? "ok" : "muted"}
            />
          </>
        )}

        {step === 2 && (
          <AuthField
            id="dateOfBirth"
            label="Date of birth"
            icon={CalendarDays}
            type="date"
            autoComplete="bday"
            max={isoDate(yearsAgo(MIN_AGE))}
            min={isoDate(yearsAgo(120))}
            value={values.dateOfBirth}
            onChange={set("dateOfBirth")}
            hint={
              errors.dateOfBirth ??
              (age !== null && age >= MIN_AGE && age < 18
                ? "You can join and play free tournaments. Paid entry and prize payouts unlock at 18."
                : `You need to be ${MIN_AGE} or older. Paid tournaments and payouts are 18+.`)
            }
            hintTone={errors.dateOfBirth ? "error" : "muted"}
          />
        )}
      </div>

      {formError && (
        <p className="field-error" role="alert">
          {formError}
        </p>
      )}

      <div className="flex gap-2.5">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            disabled={submitting}
            aria-label="Back"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-white/[0.1] text-muted transition hover:border-white/[0.2] hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary h-12 flex-1 text-[15px]">
          {submitting && <Spinner />}
          {step < STEPS.length - 1 ? "Continue" : submitting ? "Creating your account…" : "Create account"}
        </button>
      </div>
    </form>
  );
}
