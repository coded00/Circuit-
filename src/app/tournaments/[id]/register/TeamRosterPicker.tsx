"use client";

/**
 * Circuit — choosing the team and roster for a TEAM-format tournament.
 * Only teams you captain are offered; the captain is always on the
 * roster; players already entered with another team are shown but
 * can't be picked.
 */

import Link from "next/link";
import { Check, Crown, Users } from "lucide-react";
import { InfoTip } from "@/components/InfoTip";
import { basisPointsToPercent, equalBasisPoints } from "@/lib/teamPrize";
import type { CaptainTeamOption, RosterBounds } from "@/lib/teamEntries";

/** `shares` is each player's prize percent as typed; undefined means an equal split. */
export type RosterPick = { teamId: string; members: Record<string, string>; shares?: Record<string, string> };

/** What each selected player's percent box shows — the typed value, or the equal split. */
export function displayedShares(value: RosterPick, captainId: string | undefined): Record<string, string> {
  const ids = Object.keys(value.members);
  const ordered = captainId && ids.includes(captainId) ? [captainId, ...ids.filter((id) => id !== captainId)] : ids;
  const equal = equalBasisPoints(ordered.length);
  return Object.fromEntries(ordered.map((id, i) => [id, value.shares?.[id] ?? basisPointsToPercent(equal[i])]));
}

/** Null when the shares add up to 100% (or are equal); otherwise the total the captain has typed. */
export function shareTotalProblem(value: RosterPick, captainId: string | undefined): number | null {
  if (!value.shares) return null;
  const total = Object.values(displayedShares(value, captainId)).reduce((a, v) => a + (Number(v) || 0), 0);
  return Math.abs(total - 100) > 0.05 ? total : null;
}

export function TeamRosterPicker({
  options,
  bounds,
  value,
  onChange,
  profileHref,
  hasPrize = false,
}: {
  options: CaptainTeamOption[];
  bounds: RosterBounds;
  value: RosterPick;
  onChange: (next: RosterPick) => void;
  /** Where to create or manage teams. */
  profileHref: string;
  /** The tournament pays cash, so each player's share is shown. */
  hasPrize?: boolean;
}) {
  const team = options.find((t) => t.id === value.teamId);
  const count = Object.keys(value.members).length;
  const available = team ? team.members.filter((m) => !m.busyWith).length : 0;
  const captainId = team?.members.find((m) => m.isCaptain)?.userId;
  const shown = displayedShares(value, captainId);
  const problem = shareTotalProblem(value, captainId);
  const sizeText = bounds.min === bounds.max ? `${bounds.min}` : `${bounds.min}–${bounds.max}`;

  if (options.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-border-strong p-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Users size={16} /> This is a team tournament
        </span>
        <p className="text-sm text-muted">
          The team&apos;s captain registers the whole roster ({sizeText} players). Create a team and invite your players first — or ask your
          captain to add you to their roster.
        </p>
        <Link href={profileHref} className="btn-secondary h-10 w-fit px-4 text-sm">
          Create or manage teams
        </Link>
      </div>
    );
  }

  function pickTeam(id: string) {
    const next = options.find((t) => t.id === id);
    const captain = next?.members.find((m) => m.isCaptain);
    onChange({ teamId: id, members: captain ? { [captain.userId]: "" } : {}, shares: undefined });
  }

  function toggle(userId: string) {
    const members = { ...value.members };
    if (userId in members) delete members[userId];
    else members[userId] = "";
    onChange({ ...value, members, shares: undefined });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="field-label">Team</span>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Team">
          {options.map((t) => {
            const on = t.id === value.teamId;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!!t.blocked}
                onClick={() => pickTeam(t.id)}
                className={`flex flex-col items-start rounded-[10px] border px-3.5 py-2.5 text-left text-sm transition ${
                  t.blocked
                    ? "cursor-not-allowed border-dashed border-border text-muted-strong"
                    : on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-surface hover:border-border-hover"
                }`}
              >
                <span className="font-semibold">
                  {t.name}
                  {t.tag && <span className="ml-1 font-mono text-xs opacity-70">[{t.tag}]</span>}
                </span>
                <span className={`text-xs ${on ? "opacity-80" : "text-muted"}`}>
                  {t.blocked ?? `${t.members.length} member${t.members.length === 1 ? "" : "s"}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {team && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="field-label">Roster</span>
            <span className={`font-mono text-xs ${count >= bounds.min && count <= bounds.max ? "text-success" : "text-muted"}`}>
              {count} / {sizeText} players
            </span>
          </div>
          {available < bounds.min && (
            <p className="text-sm text-danger">
              Only {available} of {team.name}&apos;s members can play — this format needs at least {bounds.min}.{" "}
              <Link href={profileHref} className="font-semibold underline">
                Invite more players
              </Link>
            </p>
          )}
          <ul className="flex flex-col divide-y divide-border rounded-[12px] border border-border">
            {team.members.map((m) => {
              const on = m.userId in value.members;
              const locked = m.isCaptain || !!m.busyWith;
              return (
                <li key={m.userId} className="flex flex-col gap-2 px-3 py-2.5">
                  <label className={`flex items-center gap-3 ${locked && !m.isCaptain ? "opacity-60" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={locked}
                      onChange={() => toggle(m.userId)}
                      className="h-4 w-4 accent-[var(--accent-volt)]"
                      aria-label={`Include ${m.displayName}`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {m.displayName}
                        {m.isCaptain && <Crown size={12} className="text-accent-volt" aria-label="Captain" />}
                      </span>
                      <span className="truncate text-xs text-muted">
                        @{m.handle}
                        {m.isCaptain ? " · captain, always plays" : m.busyWith ? ` · already playing for ${m.busyWith}` : ""}
                      </span>
                    </span>
                    {on && <Check size={15} className="text-success" />}
                  </label>
                  {on && (
                    <div className="flex flex-wrap items-center gap-2">
                      {!m.isCaptain && (
                        <input
                          value={value.members[m.userId]}
                          onChange={(e) => onChange({ ...value, members: { ...value.members, [m.userId]: e.target.value } })}
                          placeholder={`${m.displayName}'s in-game ID (optional)`}
                          maxLength={60}
                          className="field-input h-9 min-w-0 flex-1 text-sm"
                        />
                      )}
                      {hasPrize && (
                        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                          Prize share
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0.01}
                            max={100}
                            step={0.01}
                            value={shown[m.userId] ?? ""}
                            onChange={(e) => onChange({ ...value, shares: { ...shown, [m.userId]: e.target.value } })}
                            aria-label={`${m.displayName}'s prize share in percent`}
                            className="field-input h-9 w-20 text-right text-sm"
                          />
                          %
                        </label>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {hasPrize && (
            <div className="flex flex-col gap-1 rounded-[10px] bg-surface-elevated/60 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold">
                  How the prize is shared
                  <InfoTip text="If your team wins prize money, each player is paid their own share straight to their own account. It starts equal; change the percentages if your team agrees on a different split. Everyone is told their share, and it can't be changed after you enter." />
                </span>
                {value.shares && (
                  <button type="button" onClick={() => onChange({ ...value, shares: undefined })} className="font-semibold underline">
                    Split equally
                  </button>
                )}
              </div>
              {problem !== null ? (
                <span className="text-danger">The shares add up to {Number(problem.toFixed(2))}%. They need to make 100%.</span>
              ) : (
                <span className="text-muted">{value.shares ? "Custom split. Adds up to 100%." : "Shared equally between everyone on the roster."}</span>
              )}
            </div>
          )}
          <span className="field-hint">
            You pay the entry fee and report results. Roster players are notified when the entry is confirmed{hasPrize ? ", along with their share of any prize" : ""}.
          </span>
        </div>
      )}
    </div>
  );
}
