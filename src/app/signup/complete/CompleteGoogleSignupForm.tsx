"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, CalendarDays, Check, Globe2, Phone, UserRound } from "lucide-react";
import { formatNigerianPhone, normalizeNigerianPhone } from "@/lib/phone";
import { AuthField } from "@/components/auth/AuthField";
import { HANDLE_PATTERN } from "@/lib/handles";
import { GoogleMark } from "@/components/auth/GoogleButton";
import { Spinner } from "@/components/Spinner";

const MAX_GAMES = 6;

export default function CompleteGoogleSignupForm({
  email,
  googleName,
  googlePicture,
  suggestedHandle,
  gameOptions,
}: {
  email: string;
  googleName: string | null;
  googlePicture: string | null;
  suggestedHandle: string;
  gameOptions: string[];
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(suggestedHandle);
  const [displayName, setDisplayName] = useState(googleName ?? "");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [games, setGames] = useState<string[]>([]);
  const [useGooglePhoto, setUseGooglePhoto] = useState(!!googlePicture);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleGame(game: string) {
    setGames((list) => (list.includes(game) ? list.filter((g) => g !== game) : list.length < MAX_GAMES ? [...list, game] : list));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    let res: Response;
    try {
      res = await fetch("/api/auth/google/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, displayName, phone, dateOfBirth, region, favoriteGames: games, useGooglePhoto }),
      });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 410) return router.replace("/signup?error=google_expired");
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }
    router.replace(`/welcome?next=${encodeURIComponent(data?.next ?? "/")}`);
    router.refresh();
  }

  async function cancel() {
    await fetch("/api/auth/google/cancel", { method: "POST" }).catch(() => undefined);
    router.replace("/signup");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[12px] border border-white/[0.08] bg-white/[0.03] p-3">
        {googlePicture && useGooglePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google-hosted profile photo
          <img src={googlePicture} alt="" referrerPolicy="no-referrer" className="h-11 w-11 shrink-0 cut-avatar object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center cut-avatar bg-surface text-base font-semibold text-muted">
            {(displayName || handle || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{displayName || googleName || "Your Google account"}</span>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted">
            <GoogleMark size={12} />
            {email}
          </span>
        </div>
      </div>

      <AuthField
        id="handle"
        label="Username"
        icon={AtSign}
        required
        autoFocus
        minLength={3}
        maxLength={20}
        pattern="[a-z0-9_]{3,20}"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={handle}
        onChange={(e) => setHandle(e.target.value.toLowerCase())}
        hint={HANDLE_PATTERN.test(handle) ? `You'll be @${handle}` : "3–20 letters, numbers or underscores."}
        hintTone={HANDLE_PATTERN.test(handle) ? "ok" : handle ? "error" : "muted"}
      />
      <AuthField id="displayName" label="Display name" icon={UserRound} maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={handle} />
      <AuthField
        id="phone"
        label="Phone number (optional)"
        icon={Phone}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="0803 123 4567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        hint={normalizeNigerianPhone(phone) ? `Saved as ${formatNigerianPhone(normalizeNigerianPhone(phone)!)}` : "Nigerian mobile. Add it now to log in with your number."}
        hintTone={normalizeNigerianPhone(phone) ? "ok" : "muted"}
      />
      <AuthField
        id="dateOfBirth"
        label="Date of birth"
        icon={CalendarDays}
        type="date"
        required
        autoComplete="bday"
        value={dateOfBirth}
        onChange={(e) => setDateOfBirth(e.target.value)}
        hint="You need to be 13 or older. Paid tournaments and payouts are 18+."
      />
      <AuthField
        id="region"
        label="Country (optional)"
        icon={Globe2}
        maxLength={60}
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        placeholder="e.g. Nigeria"
        autoComplete="country-name"
      />

      {gameOptions.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-1.5">
            Games you play <span className="font-normal text-muted">(optional)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {gameOptions.map((game) => {
              const on = games.includes(game);
              return (
                <button
                  key={game}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleGame(game)}
                  className={`flex items-center gap-1.5 cut-xs border px-3 py-1.5 text-[13px] font-medium transition ${
                    on ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:border-border-hover hover:text-foreground"
                  }`}
                >
                  {on && <Check size={13} />}
                  {game}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {googlePicture && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useGooglePhoto} onChange={(e) => setUseGooglePhoto(e.target.checked)} className="accent-[var(--foreground)]" />
          Use my Google photo as my avatar
        </label>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="submit" disabled={submitting} className="btn-primary h-12 w-full text-[15px]">
        {submitting && <Spinner />}
        {submitting ? "Creating your account…" : "Enter Circuit"}
      </button>
      <button type="button" onClick={cancel} className="text-center text-sm text-muted transition hover:text-foreground">
        Cancel
      </button>
    </form>
  );
}
