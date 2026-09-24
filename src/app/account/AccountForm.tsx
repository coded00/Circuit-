"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ImageUploadField } from "@/components/ImageUploadField";

type Bank = {
  name: string;
  code: string;
  slug: string;
};

const MAX_FAVORITE_GAMES = 6;
const MAX_BIO_LENGTH = 160;
const MAX_REGION_LENGTH = 60;

export default function AccountForm({
  initialDisplayName,
  initialAvatarUrl,
  initialPayoutMethodRef,
  initialDateOfBirth,
  initialBio,
  initialFavoriteGames,
  initialEmail,
  initialNotifyNewContent,
  initialRegion,
}: {
  initialDisplayName: string;
  initialAvatarUrl: string;
  initialPayoutMethodRef: string;
  initialDateOfBirth: string;
  initialBio: string;
  initialFavoriteGames: string[];
  initialEmail: string;
  initialNotifyNewContent: boolean;
  initialRegion: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarBlocked, setAvatarBlocked] = useState(false);
  const [payoutMethodRef, setPayoutMethodRef] = useState(initialPayoutMethodRef);
  const [dateOfBirth, setDateOfBirth] = useState(initialDateOfBirth);
  const [bio, setBio] = useState(initialBio);
  const [favoriteGames, setFavoriteGames] = useState(initialFavoriteGames.join(", "));
  const [email, setEmail] = useState(initialEmail);
  const [notifyNewContent, setNotifyNewContent] = useState(initialNotifyNewContent);
  const [region, setRegion] = useState(initialRegion);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bank resolution state
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [selectedBank, setSelectedBank] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [resolvedAccountName, setResolvedAccountName] = useState("");
  const [bankResolveError, setBankResolveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchBanks() {
      setLoadingBanks(true);
      try {
        const res = await fetch("/api/payments/banks");
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.banks)) {
            setBanks(data.banks);
          }
        }
      } catch (err) {
        console.warn("Could not load banks:", err);
      } finally {
        if (active) setLoadingBanks(false);
      }
    }
    fetchBanks();
    return () => {
      active = false;
    };
  }, []);

  async function handleResolveAndLink() {
    if (!selectedBank || accountNumber.length !== 10) return;
    setResolvingAccount(true);
    setBankResolveError(null);

    try {
      const res = await fetch("/api/payments/resolve-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankCode: selectedBank,
          accountNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBankResolveError(data.error || "Account resolution failed. Check the details.");
        return;
      }
      setResolvedAccountName(data.accountName);
      setPayoutMethodRef(data.recipientCode);
    } catch {
      setBankResolveError("Network error while resolving account.");
    } finally {
      setResolvingAccount(false);
    }
  }


  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);

    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        avatarUrl: avatarUrl || null,
        payoutMethodRef: payoutMethodRef || null,
        dateOfBirth: dateOfBirth || null,
        bio: bio || null,
        favoriteGames: favoriteGames
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean)
          .slice(0, MAX_FAVORITE_GAMES),
        email: email || null,
        notifyNewContent,
        region: region || null,
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    setSuccess(true);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="field-label">
          Display name
        </label>
        <input
          id="displayName"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="field-input"
        />
      </div>

      <ImageUploadField
        label="Profile photo (optional)"
        purpose="avatar"
        value={avatarUrl}
        onChange={setAvatarUrl}
        onValidityChange={setAvatarBlocked}
        hint="Shown on your profile, in chat and on brackets. A square photo works best."
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bio" className="field-label">
          Bio (optional)
        </label>
        <input
          id="bio"
          maxLength={MAX_BIO_LENGTH}
          placeholder="A short line shown on your public profile."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">
          {bio.length}/{MAX_BIO_LENGTH}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="field-label">
          Email (optional)
        </label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">Used only to notify you about new tournaments and Challenges.</span>
      </div>

      <label className="flex items-start gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={notifyNewContent}
          onChange={(e) => setNotifyNewContent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong bg-surface-elevated accent-accent-blue"
        />
        Notify me by email and push when a new tournament or Challenge goes live.
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="favoriteGames" className="field-label">
          Favorite games (optional)
        </label>
        <input
          id="favoriteGames"
          placeholder="e.g. EA FC 25, Call of Duty, Valorant"
          value={favoriteGames}
          onChange={(e) => setFavoriteGames(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">Comma-separated, up to {MAX_FAVORITE_GAMES} games — shown on your public profile.</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="region" className="field-label">
          Region (optional)
        </label>
        <input
          id="region"
          maxLength={MAX_REGION_LENGTH}
          placeholder="e.g. Lagos, Nigeria"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">Helps other players discover you when browsing by region.</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="dateOfBirth" className="field-label">
          Date of birth
        </label>
        <input
          id="dateOfBirth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">
          Required before any paid registration or prize payout (ACC-3) — never checked for free
          browsing or free tournaments.
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-semibold text-foreground">
              Bank Account / Payout Destination
            </label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Link your Nigerian bank account to receive prize winnings and wallet withdrawals automatically via Paystack.
            </p>
          </div>
          {payoutMethodRef && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success border border-success/30">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Active
            </span>
          )}
        </div>

        {payoutMethodRef ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded border border-border/80 bg-background/60 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {resolvedAccountName || "Linked Recipient"}
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Recipient Code: {payoutMethodRef}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayoutMethodRef("");
                  setResolvedAccountName("");
                }}
                className="text-xs text-destructive hover:underline"
              >
                Change bank account
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pt-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="bankSelect" className="field-label text-xs">
                  Select Bank
                </label>
                <select
                  id="bankSelect"
                  value={selectedBank}
                  onChange={(e) => {
                    setSelectedBank(e.target.value);
                    setBankResolveError(null);
                  }}
                  className="field-input text-sm"
                  disabled={loadingBanks}
                >
                  <option value="">{loadingBanks ? "Loading banks…" : "— Choose Bank —"}</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="accountNumber" className="field-label text-xs">
                  10-Digit Account Number (NUBAN)
                </label>
                <input
                  id="accountNumber"
                  type="text"
                  maxLength={10}
                  placeholder="0123456789"
                  value={accountNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setAccountNumber(val);
                    setBankResolveError(null);
                  }}
                  className="field-input text-sm font-mono tracking-wider"
                />
              </div>
            </div>

            {bankResolveError && (
              <p className="text-xs text-destructive">{bankResolveError}</p>
            )}

            {resolvedAccountName && (
              <div className="flex items-center gap-2 rounded bg-success/10 border border-success/30 px-3 py-2 text-xs text-success font-medium">
                <span>✓ Verified:</span>
                <span className="font-semibold">{resolvedAccountName}</span>
              </div>
            )}

            <button
              type="button"
              disabled={resolvingAccount || !selectedBank || accountNumber.length !== 10}
              onClick={handleResolveAndLink}
              className="btn-secondary self-start text-xs py-1.5 px-3"
            >
              {resolvingAccount ? "Verifying with Paystack…" : "Verify & Link Bank Account"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="field-error">{error}</p>}
      {success && <p className="text-sm text-success">Saved.</p>}

      <button type="submit" disabled={submitting || avatarBlocked} className="btn-primary self-start">
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
