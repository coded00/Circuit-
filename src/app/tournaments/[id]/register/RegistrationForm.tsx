"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Wallet, X } from "lucide-react";
import { InfoTip } from "@/components/InfoTip";
import { Spinner } from "@/components/Spinner";
import { MatchFoundHud } from "@/components/MatchFoundHud";
import type { CaptainTeamOption, RosterBounds } from "@/lib/teamEntries";
import { displayedShares, shareTotalProblem, TeamRosterPicker, type RosterPick } from "./TeamRosterPicker";

export default function RegistrationForm({
  tournamentId,
  entryFee,
  walletBalance,
  username,
  savedName,
  team,
}: {
  tournamentId: string;
  entryFee: number;
  walletBalance: number;
  /** The player's Circuit handle, offered as the name to play under. */
  username: string;
  /** The in-game name they typed last time for this game. */
  savedName: string | null;
  /** TEAM tournaments: the teams this user captains and the roster size. */
  team?: { options: CaptainTeamOption[]; bounds: RosterBounds; profileHref: string; hasPrize: boolean };
}) {
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
  const [nameStatus, setNameStatus] = useState<"idle" | "checking" | "free" | "taken">("idle");

  // Live "is this name still free in this tournament?" check, once they stop typing.
  useEffect(() => {
    if (!inGameId) {
      setNameStatus("idle");
      return;
    }
    setNameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/in-game-name?name=${encodeURIComponent(inGameId)}`);
        const data = await res.json();
        setNameStatus(data.available ? "free" : "taken");
      } catch {
        setNameStatus("idle");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [inGameId, tournamentId]);
  const canPayFromWallet = entryFee > 0 && walletBalance >= entryFee;
  const [payFromWallet, setPayFromWallet] = useState(canPayFromWallet);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [matchFound, setMatchFound] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inGameId,
        ...(nameChoice === "custom" ? { saveInGameName: true } : {}),
        ...(team ? { teamId: roster.teamId, roster: Object.entries(roster.members).map(([userId, id]) => ({ userId, inGameId: id, ...(roster.shares ? { prizePercent: Number(displayedShares(roster, captainId)[userId]) } : {}) })) } : {}),
        ...(entryFee > 0 && payFromWallet ? { payFrom: "wallet" } : {}),
      }),
    });
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
        <label className="flex items-center gap-2 rounded-[10px] border border-border p-3 text-sm">
          <input type="radio" name="nameChoice" checked={nameChoice === "username"} onChange={() => setNameChoice("username")} />
          Use my Circuit username <span className="font-mono text-muted">@{username}</span>
        </label>
        <label className="flex flex-col gap-2 rounded-[10px] border border-border p-3 text-sm">
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

      {entryFee > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="field-label">How would you like to pay?</span>
          <label className="flex items-center gap-2 rounded-[10px] border border-border p-3 text-sm">
            <input type="radio" name="payMethod" checked={!payFromWallet} onChange={() => setPayFromWallet(false)} />
            Pay by card (Paystack)
          </label>
          <label
            className={`flex items-center justify-between gap-2 rounded-[10px] border border-border p-3 text-sm ${
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
        <button type="submit" disabled={submitting || !rosterReady || !inGameId || nameStatus === "taken"} className="btn-primary">
          {submitting && <Spinner />}
          {submitting ? "Registering…" : team ? "Register team" : "Register"}
        </button>
      )}
    </form>
  );
}
