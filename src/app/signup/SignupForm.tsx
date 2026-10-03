"use client";

/**
 * Circuit — email signup as a five-step form, so no single screen is a
 * wall of fields:
 *   1. Account  — name, email, password + confirm, Terms/Privacy
 *   2. Identity — gamertag (live availability), country, birthday (13+),
 *                 optional Nigerian phone
 *   3. Games    — pick the games you play (skippable)
 *   4. Profile  — photo and bio, with a live preview (skippable)
 *   5. Review   — summary, then "Enter Circuit"
 * Nothing is saved until the last step. Then the account is created, and
 * the games, photo and bio are saved through the signed-in endpoints (an
 * upload needs a session). The server re-validates the account fields and,
 * if it rejects one, names it so we jump back to that step.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, AtSign, CalendarDays, Camera, Check, Globe, Lock, Phone, Search, Trash2, UserRound, X } from "lucide-react";
import { safeNextPath } from "@/lib/safeRedirect";
import { HANDLE_PATTERN } from "@/lib/handles";
import { formatNigerianPhone, normalizeNigerianPhone } from "@/lib/phone";
import { ACCEPTED_IMAGE_TYPES, prepareImage, type PreparedImage } from "@/lib/prepareImage";
import { AuthField, PasswordField } from "@/components/auth/AuthField";
import { GameArtTile } from "@/components/GameArtTile";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { MIN_PASSWORD_LENGTH as MIN_PASSWORD } from "@/lib/passwordRules";

const MIN_AGE = 13;
const MAX_NAME = 40;
const MAX_BIO = 160;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const STEPS = [
  { key: "account", title: "Your account", fields: ["name", "email", "password", "confirmPassword", "terms"] },
  { key: "identity", title: "Your identity", fields: ["handle", "country", "dateOfBirth", "phone"] },
  { key: "games", title: "Your games", fields: [] },
  { key: "profile", title: "Your profile", fields: ["bio"] },
  { key: "review", title: "Review", fields: [] },
] as const;
type Field = (typeof STEPS)[number]["fields"][number];

type GameOption = { id: string; name: string; category: string | null; iconUrl: string | null };
type CountryOption = { code: string; name: string };

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
function flag(code: string) {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Fields the server can reject as "already on an account". */
type ConflictField = "email" | "handle" | "phone";
const CONFLICT_TITLE: Record<ConflictField, string> = {
  email: "This email may already have an account",
  handle: "That gamertag is taken",
  phone: "That phone number is already in use",
};

type HandleStatus = { state: "idle" | "checking" | "available" | "taken" | "invalid"; message?: string };

function Avatar({ src, name, size = 64 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
    <img src={src} alt="" width={size} height={size} className="cut-avatar object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center cut-avatar bg-white/[0.08] font-display text-xl font-bold uppercase" style={{ width: size, height: size }} aria-hidden>
      {name.trim().slice(0, 1) || "?"}
    </span>
  );
}

export default function SignupForm({ games, countries }: { games: GameOption[]; countries: CountryOption[] }) {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    handle: "",
    country: "NG",
    dateOfBirth: "",
    phone: "",
    bio: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [gameIds, setGameIds] = useState<Set<string>>(new Set());
  const [gameQuery, setGameQuery] = useState("");
  const [avatar, setAvatar] = useState<PreparedImage | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Account exists but a follow-up save (games/photo/bio) failed. */
  const [partial, setPartial] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Set when the server says the email, gamertag or phone is already on an account. */
  const [conflict, setConflict] = useState<{ field: ConflictField; message: string } | null>(null);
  /** The server's answer, and which username it was for. */
  const [handleCheck, setHandleCheck] = useState<{ handle: string; available: boolean; reason?: string } | null>(null);
  const firstFieldRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarPreviewRef = useRef<string | null>(null);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = field === "handle" ? e.target.value.toLowerCase() : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  // Release the avatar's object URL when it's replaced or the form unmounts.
  useEffect(() => {
    avatarPreviewRef.current = avatar?.previewUrl ?? null;
  }, [avatar]);
  useEffect(
    () => () => {
      if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current);
    },
    [],
  );

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
      case "name":
        if (!v.name.trim()) return "Enter your name.";
        return v.name.trim().length > MAX_NAME ? `Keep it to ${MAX_NAME} characters or fewer.` : undefined;
      case "email":
        return EMAIL_PATTERN.test(v.email.trim()) ? undefined : "Enter a valid email address.";
      case "password":
        return v.password.length >= MIN_PASSWORD ? undefined : `Use at least ${MIN_PASSWORD} characters.`;
      case "confirmPassword":
        return v.confirmPassword === v.password ? undefined : "Passwords don't match.";
      case "terms":
        return acceptTerms ? undefined : "Accept the Terms and Privacy Policy to join.";
      case "handle":
        if (!HANDLE_PATTERN.test(v.handle)) return "3–20 letters, numbers or underscores.";
        return handleStatus.state === "taken" ? (handleStatus.message ?? "That username is taken.") : undefined;
      case "country":
        return countries.some((c) => c.code === v.country) ? undefined : "Choose your country.";
      case "dateOfBirth": {
        const age = ageFrom(v.dateOfBirth);
        if (age === null) return "Enter your date of birth.";
        if (age < 0 || age > 120) return "Enter your real date of birth.";
        return age < MIN_AGE ? `You need to be at least ${MIN_AGE} to join Circuit.` : undefined;
      }
      case "phone":
        return !v.phone.trim() || normalizeNigerianPhone(v.phone) ? undefined : "Enter a Nigerian mobile number, e.g. 0803 123 4567. Or leave it blank.";
      case "bio":
        return v.bio.length > MAX_BIO ? `Keep your bio to ${MAX_BIO} characters or fewer.` : undefined;
    }
  }

  async function pickAvatar(file: File | undefined) {
    if (!file) return;
    setAvatarError(null);
    try {
      const prepared = await prepareImage(file, { maxEdge: 512, format: "classic" });
      if (avatar) URL.revokeObjectURL(avatar.previewUrl);
      setAvatar(prepared);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "That image couldn't be used.");
    }
  }
  function clearAvatar() {
    if (avatar) URL.revokeObjectURL(avatar.previewUrl);
    setAvatar(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function goBack() {
    setFormError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function enter() {
    // replace, not push: Back from here must not return to the auth form.
    // New accounts go through the short communities step first, then on to `next`.
    router.replace(`/welcome?from=signup&next=${encodeURIComponent(next)}`);
    router.refresh();
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
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
          confirmPassword: values.confirmPassword,
          acceptTerms,
          handle: values.handle,
          country: values.country,
          dateOfBirth: values.dateOfBirth,
          phone: values.phone,
        }),
      });
    } catch {
      setFormError("We couldn't reach Circuit. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      const field = (data?.field === "terms" ? "terms" : data?.field) as Field | undefined;
      const message = data?.error ?? "Something went wrong. Please try again.";
      const target = field ? STEPS.findIndex((s) => (s.fields as readonly string[]).includes(field)) : -1;
      if (field && target >= 0) {
        setStep(target);
        setErrors({ [field]: message });
        if (res.status === 409 && (field === "email" || field === "handle" || field === "phone")) setConflict({ field, message });
      } else {
        setFormError(message);
      }
      setSubmitting(false);
      return;
    }

    // The account exists and we're signed in: save the optional parts.
    // None of this blocks entry — if it fails they can finish in Settings.
    const failed: string[] = [];
    // Games and photo don't depend on each other, so save them together.
    const [gamesRes, uploadRes] = await Promise.all([
      gameIds.size > 0
        ? fetch("/api/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameIds: [...gameIds] }),
          }).catch(() => null)
        : Promise.resolve(undefined),
      avatar
        ? (() => {
            const form = new FormData();
            form.append("file", avatar.blob);
            form.append("purpose", "avatar");
            return fetch("/api/uploads/image", { method: "POST", body: form }).catch(() => null);
          })()
        : Promise.resolve(undefined),
    ]);
    if (gamesRes !== undefined && !gamesRes?.ok) failed.push("your games");
    let avatarUrl: string | undefined;
    if (uploadRes !== undefined) {
      const data = uploadRes?.ok ? await uploadRes.json().catch(() => null) : null;
      if (typeof data?.url === "string") avatarUrl = data.url;
      else failed.push("your photo");
    }
    if (avatarUrl || values.bio.trim()) {
      const r = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(avatarUrl ? { avatarUrl } : {}), ...(values.bio.trim() ? { bio: values.bio.trim() } : {}) }),
      }).catch(() => null);
      if (!r?.ok) failed.push(avatarUrl ? "your photo and bio" : "your bio");
    }
    if (failed.length > 0) {
      setPartial(`Your account is ready, but we couldn't save ${failed.join(" and ")}. You can add ${failed.length > 1 ? "them" : "it"} from your profile settings.`);
      setSubmitting(false);
      return;
    }
    enter();
  }

  const passwordProgress = Math.min(1, values.password.length / MIN_PASSWORD);
  const age = ageFrom(values.dateOfBirth);
  const phoneNormalized = values.phone.trim() ? normalizeNigerianPhone(values.phone) : null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const skippable = (step === 2 && gameIds.size === 0) || (step === 3 && !avatar && !values.bio.trim());
  const country = countries.find((c) => c.code === values.country);
  const chosenGames = useMemo(() => games.filter((g) => gameIds.has(g.id)), [games, gameIds]);
  const visibleGames = useMemo(() => {
    const q = gameQuery.trim().toLowerCase();
    return q ? games.filter((g) => g.name.toLowerCase().includes(q) || g.category?.toLowerCase().includes(q)) : games;
  }, [games, gameQuery]);

  if (partial) {
    return (
      <div className="motion-slide-up flex flex-col gap-5" role="status">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-volt text-accent-volt-foreground">
            <Check size={22} />
          </span>
          <p className="font-display text-2xl leading-none font-bold tracking-tight">You&apos;re in</p>
        </div>
        <p className="text-sm text-muted">{partial}</p>
        <button type="button" onClick={enter} className="btn-primary h-12 text-[15px]">
          Continue <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="flex scroll-mt-6 flex-col gap-5">
      <Modal
        open={conflict !== null}
        onClose={() => setConflict(null)}
        variant="error"
        title={conflict ? CONFLICT_TITLE[conflict.field] : ""}
        message={conflict?.message}
        primaryAction={
          conflict?.field === "handle"
            ? { label: "Choose another gamertag", onClick: () => setConflict(null) }
            : { label: "Log in instead", onClick: () => router.push(loginHref) }
        }
        secondaryAction={
          conflict?.field === "handle"
            ? undefined
            : { label: conflict?.field === "email" ? "Use a different email" : "Use a different number", onClick: () => setConflict(null) }
        }
      >
        {conflict?.field === "email" && (
          <p className="text-xs text-muted">
            Forgot your password?{" "}
            <Link href="/forgot-password" className="font-semibold underline underline-offset-2 hover:text-foreground">
              Reset it
            </Link>
            .
          </p>
        )}
      </Modal>
      <div className="flex flex-col gap-2.5" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{current.title}</span>
          <span className="font-mono text-[11px] text-muted-strong tabular-nums">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s.key} className={`h-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-accent-volt" : "bg-white/[0.08]"}`} />
          ))}
        </div>
      </div>

      <div key={step} ref={firstFieldRef} className="motion-slide-up flex flex-col gap-4">
        {step === 0 && (
          <>
            <AuthField
              id="name"
              label="Name"
              icon={UserRound}
              autoComplete="name"
              maxLength={MAX_NAME}
              placeholder="What should we call you?"
              value={values.name}
              onChange={set("name")}
              hint={errors.name ?? "Shown on your profile and next to your results."}
              hintTone={errors.name ? "error" : "muted"}
            />
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
                <div className="h-1 flex-1 overflow-hidden rounded-none bg-white/[0.06]">
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
            <div className="flex flex-col gap-1.5">
              <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-snug text-foreground/90">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => {
                    setAcceptTerms(e.target.checked);
                    setErrors((errs) => ({ ...errs, terms: undefined }));
                  }}
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--accent-volt)]"
                  aria-describedby={errors.terms ? "terms-error" : undefined}
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-semibold underline underline-offset-2 hover:text-accent-volt">
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="font-semibold underline underline-offset-2 hover:text-accent-volt">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {errors.terms && (
                <p id="terms-error" className="text-xs text-danger" role="alert">
                  {errors.terms}
                </p>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <AuthField
              id="handle"
              label="Gamertag"
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
                    : "Your public @name. What opponents see. 3–20 letters, numbers or underscores.")
              }
              hintTone={errors.handle || handleStatus.state === "taken" || handleStatus.state === "invalid" ? "error" : handleStatus.state === "available" ? "ok" : "muted"}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="country" className="text-[13px] font-semibold text-foreground/90">
                Country
              </label>
              <div className="group relative flex items-center">
                <Globe size={17} className="pointer-events-none absolute left-3.5 text-muted-strong transition-colors group-focus-within:text-accent-volt" aria-hidden />
                <select
                  id="country"
                  value={values.country}
                  onChange={set("country")}
                  autoComplete="country"
                  className="h-12 w-full appearance-none cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] bg-white/[0.04] pr-4 pl-11 text-[15px] text-foreground outline-none transition hover:border-white/[0.14] focus:border-accent-volt/70 focus:bg-white/[0.06] focus:ring-4 focus:ring-accent-volt/10"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code} className="bg-[#191c21] text-white">
                      {flag(c.code)} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {errors.country && <p className="text-xs text-danger">{errors.country}</p>}
            </div>
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
                  : `You need to be ${MIN_AGE} or older. Paid tournaments and payouts are 18+. Never shown publicly.`)
              }
              hintTone={errors.dateOfBirth ? "error" : "muted"}
            />
            <AuthField
              id="phone"
              label="Phone number (optional)"
              icon={Phone}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="0803 123 4567"
              value={values.phone}
              onChange={set("phone")}
              hint={errors.phone ?? (phoneNormalized ? `Saved as ${formatNigerianPhone(phoneNormalized)} · you can log in with it` : "Nigerian mobile. Add it now to log in with your number.")}
              hintTone={errors.phone ? "error" : phoneNormalized ? "ok" : "muted"}
            />
          </>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Pick the games you play. We&apos;ll add you to each game&apos;s official community.</p>
            {games.length > 8 && (
              <div className="relative flex items-center">
                <Search size={16} className="pointer-events-none absolute left-3.5 text-muted-strong" aria-hidden />
                <input
                  type="search"
                  value={gameQuery}
                  onChange={(e) => setGameQuery(e.target.value)}
                  placeholder="Search games"
                  aria-label="Search games"
                  className="h-11 w-full cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] bg-white/[0.04] pr-4 pl-10 text-[14px] text-foreground outline-none placeholder:text-muted-strong focus:border-accent-volt/70"
                />
              </div>
            )}
            {games.length === 0 ? (
              <p className="cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] p-4 text-sm text-muted">No games are listed yet. You can pick yours after signing up.</p>
            ) : visibleGames.length === 0 ? (
              <p className="text-sm text-muted">No games match &ldquo;{gameQuery}&rdquo;.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {visibleGames.map((g) => {
                  const on = gameIds.has(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setGameIds((s) => {
                          const n = new Set(s);
                          if (n.has(g.id)) n.delete(g.id);
                          else n.add(g.id);
                          return n;
                        })
                      }
                      className={`group relative aspect-[4/3] overflow-hidden cut-sm [--cut-line:var(--border)] border-2 text-left transition active:scale-[0.97] ${
                        on ? "border-accent-volt shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent-volt)_14%,transparent)]" : "border-white/[0.08] hover:border-white/25"
                      }`}
                    >
                      <GameArtTile game={g.name} hideLabel fill imgWidth={400} className="transition-transform duration-300 group-hover:scale-[1.04]" />
                      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                      <span className="absolute inset-x-2.5 bottom-2 flex flex-col">
                        <span className="truncate text-[13px] font-semibold text-white">{g.name}</span>
                        {g.category && <span className="truncate font-mono text-[10px] tracking-wide text-white/60 uppercase">{g.category}</span>}
                      </span>
                      {on && (
                        <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent-volt text-accent-volt-foreground">
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-strong tabular-nums" aria-live="polite">
              {gameIds.size === 0 ? "None selected. You can skip this." : `${gameIds.size} selected`}
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] bg-white/[0.03] p-4">
              <Avatar src={avatar?.previewUrl ?? null} name={values.name || values.handle} size={72} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-display text-xl leading-tight font-bold tracking-tight uppercase">{values.name || "Your name"}</span>
                <span className="truncate font-mono text-xs text-muted">@{values.handle}</span>
                {values.bio.trim() && <span className="mt-1 line-clamp-2 text-xs text-foreground/80">{values.bio.trim()}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES} className="sr-only" id="avatar" onChange={(e) => pickAvatar(e.target.files?.[0])} />
              <label htmlFor="avatar" className="btn-secondary inline-flex h-11 cursor-pointer items-center gap-2 px-4 text-sm">
                <Camera size={16} /> {avatar ? "Change photo" : "Add a photo"}
              </label>
              {avatar && (
                <button type="button" onClick={clearAvatar} className="flex h-11 items-center gap-1.5 px-3 text-sm text-muted hover:text-foreground">
                  <Trash2 size={15} /> Remove
                </button>
              )}
            </div>
            {avatarError && (
              <p className="text-xs text-danger" role="alert">
                {avatarError}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="bio" className="text-[13px] font-semibold text-foreground/90">
                Bio (optional)
              </label>
              <textarea
                id="bio"
                rows={3}
                maxLength={MAX_BIO}
                value={values.bio}
                onChange={set("bio")}
                placeholder="Main, favourite mode, what you're here to win…"
                className="w-full resize-none cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[15px] text-foreground outline-none transition placeholder:text-muted-strong hover:border-white/[0.14] focus:border-accent-volt/70 focus:bg-white/[0.06] focus:ring-4 focus:ring-accent-volt/10"
              />
              <p className={`text-right font-mono text-[11px] tabular-nums ${errors.bio ? "text-danger" : "text-muted-strong"}`}>
                {values.bio.length}/{MAX_BIO}
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">Check your details. Anything here can be changed later from your profile.</p>
            <div className="flex items-center gap-4 cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] bg-white/[0.03] p-4">
              <Avatar src={avatar?.previewUrl ?? null} name={values.name || values.handle} size={64} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-display text-xl leading-tight font-bold tracking-tight uppercase">{values.name}</span>
                <span className="truncate font-mono text-xs text-muted">@{values.handle}</span>
                {country && (
                  <span className="mt-0.5 text-xs text-foreground/80">
                    {flag(country.code)} {country.name}
                  </span>
                )}
              </div>
            </div>
            <dl className="flex flex-col divide-y divide-white/[0.06] cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] text-sm">
              {[
                ["Email", values.email.trim()],
                ["Phone", phoneNormalized ? formatNigerianPhone(phoneNormalized) : "Not added"],
                ["Games", chosenGames.length > 0 ? chosenGames.map((g) => g.name).join(", ") : "None picked yet"],
                ["Bio", values.bio.trim() || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 px-4 py-2.5">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 text-right break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted-strong">We&apos;ll email you a link to verify your address.</p>
          </div>
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
            onClick={goBack}
            disabled={submitting}
            aria-label="Back"
            className="flex h-12 w-12 shrink-0 items-center justify-center cut-sm [--cut-line:rgb(255_255_255/0.1)] border border-white/[0.1] text-muted transition hover:border-white/[0.2] hover:text-foreground active:scale-95"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary h-12 flex-1 text-[15px]">
          {submitting && <Spinner />}
          {isLast ? (submitting ? "Creating your account…" : "Enter Circuit") : skippable ? "Skip for now" : "Continue"}
        </button>
      </div>
    </form>
  );
}
