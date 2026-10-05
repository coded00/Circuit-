"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Wallet, X } from "lucide-react";
import { InfoTip } from "@/components/InfoTip";
import { Spinner } from "@/components/Spinner";
import { MatchFoundHud } from "@/components/MatchFoundHud";
import type { CaptainTeamOption, RosterBounds } from "@/lib/teamEntries";
import { displayedShares, shareTotalProblem, TeamRosterPicker, type RosterPick } from "./TeamRosterPicker";
import { EMPTY_STREAM, StreamFields, type StreamValue } from "@/components/streams/StreamFields";

export default function RegistrationForm({
  tournamentId,
  entryFee,
  walletBalance,
  username,
  savedName,
  rulesText,
  team,
  playerStreams = false,
}: {
  tournamentId: string;
  entryFee: number;
  walletBalance: number;
  /** The player's Circuit handle, offered as the name to play under. */
  username: string;
  /** The in-game name they typed last time for this game. */
  savedName: string | null;
  /** The organizer's rules, shown before the player agrees to them. */
  rulesText: string | null;
  /** TEAM tournaments: the teams this user captains and the roster size. */
  team?: { options: CaptainTeamOption[]; bounds: RosterBounds; profileHref: string; hasPrize: boolean };
  /** The tournament takes player streams: offer an optional place to add their own channel. */
  playerStreams?: boolean;
}) {
  const [stream, setStream] = useState<StreamValue>(EMPTY_STREAM);
  const firstTeam = team?.options.find((t) => !t.blocked);
  const [roster, setRoster] = useState<RosterPick>(() => {
    const captain = firstTeam?.members.find((m) => m.isCaptain);
    return { teamId: firstTeam?.id ?? "", members: captain ? { [captain.userId]: "" } : {} };
  });
  const rosterSize = Object.keys(roster.members).length;
  const captainId = team?.options.find((t) => t.id === roster.teamId)?.members.find((m) => m.isCaptain)?.userId;
  const rosterReady = !team || (!!roster.teamId && rosterSize >= team.bounds.min && rosterSize <= team.bounds.max && shareTotalProblem(roster, captainId) === null);
  const router = useRouter();
  const [nameChoice, setNameChoice] = useState<"username" | "custom">(savedName ? "custom" : "username");
  const [customName, setCustomName] = useState(savedName ?? "");
  const inGameId = nameChoice === "username" ? username : customName.trim();
  // The last name the server answered for — the status below is derived from it, so typing
  // shows "checking" until the answer for exactly that name arrives.
  const [checked, setChecked] = useState<{ name: string; free: boolean } | null>(null);
  const nameStatus: "idle" | "checking" | "free" | "taken" = !inGameId ? "idle" : checked?.name !== inGameId ? "checking" : checked.free ? "free" : "taken";

  // Live "is this name still free in this tournament?" check, once they stop typing.
  useEffect(() => {
    if (!inGameId) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/in-game-name?name=${encodeURIComponent(inGameId)}`);
        const data = await res.json();
        setChecked({ name: inGameId, free: !!data.available });
      } catch {
        // Can't tell: leave it to the server's own check when they register.
        setChecked({ name: inGameId, free: true });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [inGameId, tournamentId]);
  const canPayFromWallet = entryFee > 0 && walletBalance >= entryFee;
  const [payFromWallet, setPayFromWallet] = useState(canPayFromWallet);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    let res: Response;
    try {
      res = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inGameId,
        ...(nameChoice === "custom" ? { saveInGameName: true } : {}),
        ...(team ? { teamId: roster.teamId, roster: Object.entries(roster.members).map(([userId, id]) => ({ userId, inGameId: id, ...(roster.shares ? { prizePercent: Number(displayedShares(roster, captainId)[userId]) } : {}) })) } : {}),
        ...(entryFee > 0 && payFromWallet ? { payFrom: "wallet" } : {}),
        ...(playerStreams && stream.url.trim() ? { stream: { platform: stream.platform, platformName: stream.platform === "OTHER" ? stream.platformName : null, url: stream.url } } : {}),
      }),
      });
    } catch {
      setError("We couldn't reach Circuit. Check your connection and try again.");
      setSubmitting(false);
      return;
    }
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl;
      return;
    }

    // Card payments leave via authorizationUrl above and never reach here
    // (Paystack/Flutterwave's own redirect handles that success moment) —
    // this is the free-entry and pay-from-wallet path, where registration
    // is already complete the instant this response comes back.
    setMatchFound(true);
  }

  if (matchFound) {
    return (
      <MatchFoundHud
        onComplete={() => {
          router.replace(`/tournaments/${tournamentId}`);
          router.refresh();
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {team && <TeamRosterPicker options={team.options} bounds={team.bounds} value={roster} onChange={setRoster} profileHref={team.profileHref} hasPrize={team.hasPrize} />}
      {(!team || team.options.length > 0) && (
      <div className="flex flex-col gap-2">
        <span className="field-label flex items-center gap-1.5">
          {team ? "Your name in the tournament (captain)" : "Name to play under"}
          <InfoTip text="This is the name other players and the organizer will see in the bracket and on your match page. Names have to be unique inside a tournament, so if yours is taken you'll need another." />
        </span>
        <label className="flex items-center gap-2 rounded-none border border-border p-3 text-sm">
          <input type="radio" name="nameChoice" checked={nameChoice === "username"} onChange={() => setNameChoice("username")} />
          Use my Circuit username <span className="font-mono text-muted">@{username}</span>
        </label>
        <label className="flex flex-col gap-2 rounded-none border border-border p-3 text-sm">
          <span className="flex items-center gap-2">
            <input type="radio" name="nameChoice" checked={nameChoice === "custom"} onChange={() => setNameChoice("custom")} />
            Use my in-game name
          </span>
          {nameChoice === "custom" && (
            <input
              id="inGameId"
              required
              maxLength={60}
              autoFocus
              placeholder="The name you play under in the game"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="field-input"
            />
          )}
        </label>
        <p className="flex items-center gap-1.5 text-xs" aria-live="polite">
          {nameStatus === "checking" && <span className="text-muted">Checking if that name is free…</span>}
          {nameStatus === "free" && (
            <span className="flex items-center gap-1 text-success">
              <Check size={13} /> “{inGameId}” is available
            </span>
          )}
          {nameStatus === "taken" && (
            <span className="flex items-center gap-1 text-destructive">
              <X size={13} /> “{inGameId}” is already taken in this tournament — choose a different name
            </span>
          )}
        </p>
      </div>
      )}

      {playerStreams && (
        <div className="flex flex-col gap-2">
          <span className="field-label">Add your stream (optional)</span>
          <p className="text-xs text-muted">Let viewers watch your matches live.</p>
          <StreamFields idPrefix="player-stream" value={stream} onChange={setStream} urlLabel="Channel URL" />
        </div>
      )}

      {(!team || team.options.length > 0) && (
        <div className="flex flex-col gap-2">
          <span className="field-label">Tournament rules</span>
          {rulesText ? (
            <div className="max-h-44 overflow-y-auto rounded-none border border-border bg-surface-elevated p-3 text-[13px] leading-relaxed whitespace-pre-wrap">{rulesText}</div>
          ) : (
            <p className="rounded-none border border-border p-3 text-[13px] text-muted">The organizer hasn&apos;t posted extra rules. Play fair and report results honestly.</p>
          )}
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
            <span>I&apos;ve read the rules and agree to follow them.</span>
          </label>
        </div>
      )}

      {entryFee > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="field-label">How would you like to pay?</span>
          <label className="flex items-center gap-2 rounded-none border border-border p-3 text-sm">
            <input type="radio" name="payMethod" checked={!payFromWallet} onChange={() => setPayFromWallet(false)} />
            Pay by card (Paystack)
          </label>
          <label
            className={`flex items-center justify-between gap-2 rounded-none border border-border p-3 text-sm ${
              canPayFromWallet ? "" : "cursor-not-allowed opacity-50"
            }`}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name="payMethod"
                checked={payFromWallet}
                disabled={!canPayFromWallet}
                onChange={() => setPayFromWallet(true)}
              />
              <Wallet size={14} className="text-accent-volt" />
              Pay from Wallet balance
            </span>
            <span className="text-metadata">₦ {(walletBalance / 100).toLocaleString("en-NG")} available</span>
          </label>
        </div>
      )}

      {error && <p className="field-error motion-fade-in">{error}</p>}
      {(!team || team.options.length > 0) && (
        <button type="submit" disabled={submitting || !rosterReady || !inGameId || nameStatus === "taken" || !rulesAccepted} className="btn-primary">
          {submitting && <Spinner />}
          {submitting ? "Registering…" : entryFee > 0 ? (payFromWallet ? "Pay from wallet and register" : "Continue to payment") : team ? "Register team" : "Register"}
        </button>
      )}
    </form>
  );
}
