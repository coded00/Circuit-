"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { challengePool } from "@/lib/dailyChallenges";
import { worstCasePayout } from "@/lib/challengePrizes";
import { PRIZE_PRESETS } from "@/lib/prizes";
import { naira } from "@/components/admin/ui";

export type FormGame = { id: string; name: string; modes: { id: string; name: string }[] };

/** What the form starts from when editing a draft. Dates are ISO strings; the form shows them in the browser's local time. */
export type FormInitial = {
  gameId: string;
  gameModeId: string | null;
  title: string;
  rules: string;
  evidenceRequirements: string;
  requireRecording: boolean;
  metricLabel: string;
  metricUnit: string | null;
  direction: "HIGHER" | "LOWER";
  tiebreakLabel: string | null;
  tiebreakDirection: "HIGHER" | "LOWER";
  tiebreakRule: string;
  entryFee: number;
  minEntrants: number;
  maxEntrants: number;
  prizeSplit: number[];
  entryOpensAt: string;
  entryClosesAt: string;
  windowStartsAt: string;
  windowEndsAt: string;
  submissionsCloseAt: string;
  disputeWindowMinutes: number;
  requirements: FormRequirement[];
  kind: "STANDARD" | "WEAPON" | "SKILL" | "COMBINED";
  weaponLabel: string | null;
  scoreNeedsRecording: boolean;
  minScore: number | null;
  noWinnerPolicy: "HOUSE_KEEPS" | "REFUND_ENTRIES";
  prizeCategories: FormCategory[];
};

/** One prize category row in the editor. `amount` is whole naira while being typed; it is sent as kobo. */
export type FormCategory = {
  key: string;
  name: string;
  amount: string;
  /** The key of the number target this prize ranks by; "" = the ranked score. */
  metricKey: string;
  place: string;
  /** Keys of requirements that must also be met for this prize. */
  requires: string[];
  /** Keys of the categories combined into this prize (empty = an ordinary prize). */
  comboOf: string[];
};

/** One requirement row in the editor. A target keeps its number as text while it is being typed. */
export type FormRequirement = {
  /** Stable while editing so prize categories can point at it. */
  key: string;
  kind: "CONDITION" | "TARGET";
  label: string;
  /** Everyone must meet it to rank at all. Untick when only one prize cares about it. */
  gate: boolean;
  /** The stat can't be read off a scoreboard, so a prize that depends on it needs a recording. */
  needsRecording: boolean;
  unit: string;
  direction: "HIGHER" | "LOWER";
  threshold: string;
};

/** An ISO instant as the value a datetime-local input wants: local wall-clock time, no zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inFuture(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.toISOString());
}

const CUSTOM = "custom";

export function DailyChallengeForm({
  games,
  platformFeeBps,
  maxEntryFeeKobo,
  maxEntrants: maxEntrantsLimit,
  maxPayoutBps,
  challengeId,
  initial,
}: {
  games: FormGame[];
  platformFeeBps: number;
  /** The most a challenge's prizes may add up to, as a share of its minimum field's entries (basis points). */
  maxPayoutBps: number;
  maxEntryFeeKobo: number;
  maxEntrants: number;
  /** Set when editing an existing draft. */
  challengeId?: string;
  initial?: FormInitial;
}) {
  const router = useRouter();
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [gameId, setGameId] = useState(initial?.gameId ?? games[0]?.id ?? "");
  const [gameModeId, setGameModeId] = useState(initial?.gameModeId ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [rules, setRules] = useState(initial?.rules ?? "");
  const [evidence, setEvidence] = useState(initial?.evidenceRequirements ?? "A screenshot of the full match-end scoreboard, showing your in-game name and the final score.");
  const [requireRecording, setRequireRecording] = useState(initial?.requireRecording ?? false);
  const [metricLabel, setMetricLabel] = useState(initial?.metricLabel ?? "Kills");
  const [metricUnit, setMetricUnit] = useState(initial?.metricUnit ?? "");
  const [direction, setDirection] = useState<"HIGHER" | "LOWER">(initial?.direction ?? "HIGHER");
  const [tiebreakLabel, setTiebreakLabel] = useState(initial?.tiebreakLabel ?? "");
  const [tiebreakDirection, setTiebreakDirection] = useState<"HIGHER" | "LOWER">(initial?.tiebreakDirection ?? "HIGHER");
  const [tiebreakRule, setTiebreakRule] = useState(initial?.tiebreakRule ?? "Prize shares are split between the entries that are level.");
  const [feeNaira, setFeeNaira] = useState(String((initial?.entryFee ?? 0) / 100));
  const [minEntrants, setMinEntrants] = useState(String(initial?.minEntrants ?? 2));
  const [maxEntrants, setMaxEntrants] = useState(String(initial?.maxEntrants ?? 20));
  const presetFor = (split: number[]) => PRIZE_PRESETS.find((p) => (split.length === 0 ? p.id === "wta" : p.split.join() === split.join()))?.id ?? CUSTOM;
  const [splitChoice, setSplitChoice] = useState(initial ? presetFor(initial.prizeSplit) : "wta");
  const [customSplit, setCustomSplit] = useState((initial?.prizeSplit ?? []).join(", "));
  const [entryOpensAt, setEntryOpensAt] = useState(initial ? toLocalInput(initial.entryOpensAt) : inFuture(1));
  const [entryClosesAt, setEntryClosesAt] = useState(initial ? toLocalInput(initial.entryClosesAt) : inFuture(5));
  const [windowStartsAt, setWindowStartsAt] = useState(initial ? toLocalInput(initial.windowStartsAt) : inFuture(5));
  const [windowEndsAt, setWindowEndsAt] = useState(initial ? toLocalInput(initial.windowEndsAt) : inFuture(7));
  const [submissionsCloseAt, setSubmissionsCloseAt] = useState(initial ? toLocalInput(initial.submissionsCloseAt) : inFuture(8));
  const [disputeWindowMinutes, setDisputeWindowMinutes] = useState(String(initial?.disputeWindowMinutes ?? 30));
  const [requirements, setRequirements] = useState<FormRequirement[]>(initial?.requirements ?? []);
  const [kind, setKind] = useState<"STANDARD" | "WEAPON" | "SKILL" | "COMBINED">(initial?.kind ?? "STANDARD");
  const [weaponLabel, setWeaponLabel] = useState(initial?.weaponLabel ?? "");
  const [scoreNeedsRecording, setScoreNeedsRecording] = useState(initial?.scoreNeedsRecording ?? false);
  const [minScore, setMinScore] = useState(initial?.minScore === null || initial?.minScore === undefined ? "" : String(initial.minScore));
  const [noWinnerPolicy, setNoWinnerPolicy] = useState<"HOUSE_KEEPS" | "REFUND_ENTRIES">(initial?.noWinnerPolicy ?? "HOUSE_KEEPS");
  const [prizeMode, setPrizeMode] = useState<"split" | "categories">(initial && initial.prizeCategories.length > 0 ? "categories" : "split");
  const [categories, setCategories] = useState<FormCategory[]>(initial?.prizeCategories ?? []);
  const [nextKey, setNextKey] = useState(1000);
  const newKey = (prefix: string) => {
    setNextKey((n) => n + 1);
    return `${prefix}${nextKey}`;
  };
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modes = useMemo(() => games.find((g) => g.id === gameId)?.modes ?? [], [games, gameId]);

  const prizeSplit: number[] = useMemo(() => {
    if (splitChoice === CUSTOM) return customSplit.split(/[\s,/]+/).filter(Boolean).map(Number);
    const preset = PRIZE_PRESETS.find((p) => p.id === splitChoice);
    return preset && preset.id !== "wta" ? preset.split : [];
  }, [splitChoice, customSplit]);

  // What the prize pool will be at the smallest and largest field, so staff see the money before they publish it.
  const fee = Math.round(Number(feeNaira) * 100);
  const lo = Number(minEntrants);
  const hi = Number(maxEntrants);
  const showPreview = Number.isFinite(fee) && fee > 0 && Number.isInteger(lo) && Number.isInteger(hi) && lo > 0 && hi >= lo;
  const poolLo = showPreview ? challengePool({ entryFee: fee, platformFeeBps, entryCount: lo }) : null;
  const poolHi = showPreview ? challengePool({ entryFee: fee, platformFeeBps, entryCount: hi }) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const iso = (local: string) => (local ? new Date(local).toISOString() : "");
    const body = {
      gameId,
      gameModeId: gameModeId || null,
      title,
      rules,
      evidenceRequirements: evidence,
      requireRecording,
      metricLabel,
      metricUnit,
      direction,
      tiebreakLabel,
      tiebreakDirection,
      tiebreakRule,
      entryFee: fee,
      minEntrants: Number(minEntrants),
      maxEntrants: Number(maxEntrants),
      prizeSplit: prizeMode === "categories" ? [] : prizeSplit,
      entryOpensAt: iso(entryOpensAt),
      entryClosesAt: iso(entryClosesAt),
      windowStartsAt: iso(windowStartsAt),
      windowEndsAt: iso(windowEndsAt),
      submissionsCloseAt: iso(submissionsCloseAt),
      disputeWindowMinutes: Number(disputeWindowMinutes),
      requirements: requirements.map((r) =>
        r.kind === "CONDITION"
          ? { key: r.key, kind: "CONDITION", label: r.label, gate: r.gate, needsRecording: r.needsRecording }
          : { key: r.key, kind: "TARGET", label: r.label, unit: r.unit, direction: r.direction, threshold: r.threshold, gate: r.gate, needsRecording: r.needsRecording },
      ),
      kind,
      weaponLabel,
      scoreNeedsRecording,
      minScore,
      noWinnerPolicy,
      prizeCategories:
        prizeMode === "categories"
          ? categories.map((c) => ({ key: c.key, name: c.name, amount: Math.round(Number(c.amount) * 100), metricKey: c.metricKey || null, place: c.place, requires: c.requires, comboOf: c.comboOf }))
          : [],
    };
    const res = await fetch(challengeId ? `/api/admin/challenges/daily/${challengeId}` : "/api/admin/daily-challenges", {
      method: challengeId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    router.push(`/admin/challenges/daily/${challengeId ?? data.id}`);
    router.refresh();
  }

  const group = "flex flex-col gap-1.5";
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="admin-section-title mb-1">What players do</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={group}>
            <label htmlFor={id("game")} className="field-label">Game</label>
            <select id={id("game")} required value={gameId} onChange={(e) => { setGameId(e.target.value); setGameModeId(""); }} className="field-select">
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className={group}>
            <label htmlFor={id("mode")} className="field-label">Mode (optional)</label>
            <select id={id("mode")} value={gameModeId} onChange={(e) => setGameModeId(e.target.value)} className="field-select">
              <option value="">Any mode — the rules say which</option>
              {modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
        <div className={group}>
          <label htmlFor={id("title")} className="field-label">Title</label>
          <input id={id("title")} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="field-input" placeholder="Most kills in one Hardpoint match" />
        </div>
        <div className={group}>
          <label htmlFor={id("rules")} className="field-label">Rules — which matches count</label>
          <textarea id={id("rules")} required rows={4} value={rules} onChange={(e) => setRules(e.target.value)} className="field-input" placeholder="Ranked Hardpoint, any map, default settings. One match only." />
        </div>
        <div className={group}>
          <label htmlFor={id("evidence")} className="field-label">Evidence players upload</label>
          <textarea id={id("evidence")} required rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} className="field-input" />
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={requireRecording} onChange={(e) => setRequireRecording(e.target.checked)} />
          Also require a screen recording
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="admin-section-title mb-1">Type and target</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={group}>
            <label htmlFor={id("kind")} className="field-label">Challenge type</label>
            <select id={id("kind")} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="field-select">
              <option value="STANDARD">Standard</option>
              <option value="WEAPON">Weapon challenge</option>
              <option value="SKILL">Skill challenge</option>
              <option value="COMBINED">Combined achievements</option>
            </select>
          </div>
          <div className={group}>
            <label htmlFor={id("weapon")} className="field-label">Weapon {kind === "WEAPON" ? "(required)" : "(optional)"}</label>
            <input id={id("weapon")} maxLength={40} value={weaponLabel} onChange={(e) => setWeaponLabel(e.target.value)} className="field-input" placeholder="AK-47, Sniper rifles…" />
          </div>
          <div className={group}>
            <label htmlFor={id("minscore")} className="field-label">Minimum to qualify (optional)</label>
            <input id={id("minscore")} inputMode="numeric" value={minScore} onChange={(e) => setMinScore(e.target.value)} className="field-input" placeholder="e.g. 5" />
          </div>
        </div>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-1" checked={scoreNeedsRecording} onChange={(e) => setScoreNeedsRecording(e.target.checked)} />
          <span>The ranked score isn&apos;t shown on the scoreboard (a headshot count, a streak). It can only be checked from a screen recording.</span>
        </label>
        <p className="text-[12px] text-muted">
          A weapon challenge, or any prize that depends on a stat the scoreboard doesn&apos;t show, can&apos;t be published unless a screen recording is required — a reviewer
          has nothing else to check a weapon kill against. With a minimum set, an entry below it doesn&apos;t qualify.
        </p>
        <div className={group}>
          <label htmlFor={id("nowinner")} className="field-label">If nobody qualifies</label>
          <select id={id("nowinner")} value={noWinnerPolicy} onChange={(e) => setNoWinnerPolicy(e.target.value as typeof noWinnerPolicy)} className="field-select sm:w-96">
            <option value="HOUSE_KEEPS">The house keeps all the entry money</option>
            <option value="REFUND_ENTRIES">Refund every entry</option>
          </select>
          <span className="text-[12px] text-muted">Shown to players before they pay, and locked when you publish. It can&apos;t be changed after results are known.</span>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="admin-section-title mb-1">Scoring</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={group}>
            <label htmlFor={id("metric")} className="field-label">Score is</label>
            <input id={id("metric")} required maxLength={40} value={metricLabel} onChange={(e) => setMetricLabel(e.target.value)} className="field-input" placeholder="Kills" />
          </div>
          <div className={group}>
            <label htmlFor={id("unit")} className="field-label">Unit (optional)</label>
            <input id={id("unit")} maxLength={40} value={metricUnit} onChange={(e) => setMetricUnit(e.target.value)} className="field-input" placeholder="seconds" />
          </div>
          <div className={group}>
            <label htmlFor={id("dir")} className="field-label">Winner has the</label>
            <select id={id("dir")} value={direction} onChange={(e) => setDirection(e.target.value as "HIGHER" | "LOWER")} className="field-select">
              <option value="HIGHER">Highest score</option>
              <option value="LOWER">Lowest score (a time)</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={group}>
            <label htmlFor={id("tb")} className="field-label">Tie-break stat (optional)</label>
            <input id={id("tb")} maxLength={40} value={tiebreakLabel} onChange={(e) => setTiebreakLabel(e.target.value)} className="field-input" placeholder="Deaths" />
          </div>
          <div className={group}>
            <label htmlFor={id("tbdir")} className="field-label">Tie-break winner has the</label>
            <select id={id("tbdir")} value={tiebreakDirection} onChange={(e) => setTiebreakDirection(e.target.value as "HIGHER" | "LOWER")} className="field-select">
              <option value="HIGHER">Highest</option>
              <option value="LOWER">Lowest</option>
            </select>
          </div>
        </div>
        <div className={group}>
          <label htmlFor={id("tbrule")} className="field-label">If still level, then</label>
          <textarea id={id("tbrule")} rows={2} value={tiebreakRule} onChange={(e) => setTiebreakRule(e.target.value)} className="field-input" />
          <span className="text-[12px] text-muted">Shown to players before they enter. Never leave a tie to chance.</span>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="admin-section-title mb-1">Requirements to qualify</legend>
        <p className="text-[12px] text-muted">
          Besides the score, a player can be asked to meet conditions (pass or fail, like &ldquo;win the match&rdquo;) and targets (a number, like &ldquo;at
          least 10 kills&rdquo;). Staff check each one against the evidence by hand, and an entry only ranks if every one is met. Players see them before they pay.
        </p>
        {requirements.map((r, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-[8px] border border-border p-3 sm:grid-cols-[130px_1fr_auto]">
            <div className={group}>
              <label htmlFor={id(`rk${i}`)} className="field-label">Type</label>
              <select
                id={id(`rk${i}`)}
                value={r.kind}
                onChange={(e) => setRequirements((rs) => rs.map((x, j) => (j === i ? { ...x, kind: e.target.value as "CONDITION" | "TARGET" } : x)))}
                className="field-select"
              >
                <option value="CONDITION">Condition</option>
                <option value="TARGET">Target</option>
              </select>
            </div>
            <div className={group}>
              <label htmlFor={id(`rl${i}`)} className="field-label">{r.kind === "CONDITION" ? "What must be true" : "What is counted"}</label>
              <input
                id={id(`rl${i}`)}
                maxLength={80}
                value={r.label}
                onChange={(e) => setRequirements((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className="field-input"
                placeholder={r.kind === "CONDITION" ? "Win the match" : "Kills"}
              />
            </div>
            <button type="button" onClick={() => {
                const gone = r.key;
                setRequirements((rs) => rs.filter((_, j) => j !== i));
                setCategories((cs) => cs.filter((c) => c.metricKey !== gone).map((c) => ({ ...c, requires: c.requires.filter((k) => k !== gone) })));
              }} className="btn-ghost text-sm" aria-label={`Remove requirement ${i + 1}`}>
              Remove
            </button>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] sm:col-span-3">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={r.gate} onChange={(e) => setRequirements((rs) => rs.map((x, j) => (j === i ? { ...x, gate: e.target.checked } : x)))} />
                Everyone must meet this to rank
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={r.needsRecording} onChange={(e) => setRequirements((rs) => rs.map((x, j) => (j === i ? { ...x, needsRecording: e.target.checked } : x)))} />
                Can only be checked from a recording
              </label>
            </div>
            {r.kind === "TARGET" && (
              <div className="grid grid-cols-3 gap-2 sm:col-span-3">
                <div className={group}>
                  <label htmlFor={id(`rd${i}`)} className="field-label">Needs to be</label>
                  <select
                    id={id(`rd${i}`)}
                    value={r.direction}
                    onChange={(e) => setRequirements((rs) => rs.map((x, j) => (j === i ? { ...x, direction: e.target.value as "HIGHER" | "LOWER" } : x)))}
                    className="field-select"
                  >
                    <option value="HIGHER">At least</option>
                    <option value="LOWER">At most</option>
                  </select>
                </div>
                <div className={group}>
                  <label htmlFor={id(`rt${i}`)} className="field-label">Number</label>
                  <input
                    id={id(`rt${i}`)}
                    inputMode="numeric"
                    value={r.threshold}
                    onChange={(e) => setRequirements((rs) => rs.map((x, j) => (j === i ? { ...x, threshold: e.target.value } : x)))}
                    className="field-input"
                  />
                </div>
                <div className={group}>
                  <label htmlFor={id(`ru${i}`)} className="field-label">Unit (optional)</label>
                  <input
                    id={id(`ru${i}`)}
                    maxLength={40}
                    value={r.unit}
                    onChange={(e) => setRequirements((rs) => rs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))}
                    className="field-input"
                    placeholder="seconds"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
        {requirements.length < 8 && (
          <button
            type="button"
            onClick={() => setRequirements((rs) => [...rs, { key: newKey("r"), kind: "CONDITION", label: "", gate: true, needsRecording: false, unit: "", direction: "HIGHER", threshold: "" }])}
            className="btn-secondary self-start text-sm"
          >
            Add a requirement
          </button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="admin-section-title mb-1">Entry and prize</legend>
        <div role="radiogroup" aria-label="How prizes are set" className="flex flex-wrap gap-2">
          {([["split", "Simple: split the pool by rank"], ["categories", "Prize categories with fixed amounts"]] as const).map(([mode, label]) => (
            <label key={mode} className={`cut-xs cursor-pointer px-3.5 py-2 text-[13px] font-medium ${prizeMode === mode ? "bg-foreground text-background" : "bg-surface-elevated text-muted"}`}>
              <input type="radio" className="sr-only" name={id("prizemode")} checked={prizeMode === mode} onChange={() => setPrizeMode(mode)} />
              {label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className={group}>
            <label htmlFor={id("fee")} className="field-label">Entry fee (₦, 0 = free)</label>
            <input id={id("fee")} required inputMode="decimal" value={feeNaira} onChange={(e) => setFeeNaira(e.target.value)} className="field-input" />
            <span className="text-[12px] text-muted">Limit ₦{(maxEntryFeeKobo / 100).toLocaleString("en-NG")}</span>
          </div>
          <div className={group}>
            <label htmlFor={id("min")} className="field-label">Minimum players</label>
            <input id={id("min")} required inputMode="numeric" value={minEntrants} onChange={(e) => setMinEntrants(e.target.value)} className="field-input" />
            <span className="text-[12px] text-muted">Fewer than this and everyone is refunded</span>
          </div>
          <div className={group}>
            <label htmlFor={id("max")} className="field-label">Maximum players</label>
            <input id={id("max")} required inputMode="numeric" value={maxEntrants} onChange={(e) => setMaxEntrants(e.target.value)} className="field-input" />
            <span className="text-[12px] text-muted">Limit {maxEntrantsLimit}</span>
          </div>
          {prizeMode === "split" && (
          <div className={group}>
            <label htmlFor={id("split")} className="field-label">Prize split</label>
            <select id={id("split")} value={splitChoice} onChange={(e) => setSplitChoice(e.target.value)} className="field-select">
              {PRIZE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value={CUSTOM}>Custom…</option>
            </select>
          </div>
          )}
        </div>
        {prizeMode === "split" && splitChoice === CUSTOM && (
          <div className={group}>
            <label htmlFor={id("custom")} className="field-label">Custom split (percentages, first place first)</label>
            <input id={id("custom")} value={customSplit} onChange={(e) => setCustomSplit(e.target.value)} className="field-input sm:w-60" placeholder="50, 30, 20" />
            <span className="text-[12px] text-muted">Can&apos;t pay more places than the minimum number of players.</span>
          </div>
        )}
        {prizeMode === "split" && poolLo && poolHi ? (
          <p className="rounded-[8px] border border-border bg-surface-elevated px-3 py-2 text-[13px] text-muted">
            At {lo} players the prize pool is <strong className="text-foreground">{naira(poolLo.prizePool)}</strong>; at {hi} it&apos;s{" "}
            <strong className="text-foreground">{naira(poolHi.prizePool)}</strong>. Circuit keeps {(platformFeeBps / 100).toFixed(2).replace(/\.00$/, "")}% of each fee
            (the current platform rate, fixed when you publish).
          </p>
        ) : prizeMode === "split" ? (
          <p className="text-[12px] text-muted">A free challenge pays a prize only if a sponsor funds it.</p>
        ) : (
          <CategoryEditor
            categories={categories}
            setCategories={setCategories}
            requirements={requirements}
            newKey={newKey}
            fee={fee}
            lo={lo}
            hi={hi}
            maxPayoutBps={maxPayoutBps}
          />
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="admin-section-title mb-1">Timeline (your local time)</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={group}>
            <label htmlFor={id("opens")} className="field-label">Entries open</label>
            <input id={id("opens")} required type="datetime-local" value={entryOpensAt} onChange={(e) => setEntryOpensAt(e.target.value)} className="field-input" />
          </div>
          <div className={group}>
            <label htmlFor={id("closes")} className="field-label">Entries close</label>
            <input id={id("closes")} required type="datetime-local" value={entryClosesAt} onChange={(e) => setEntryClosesAt(e.target.value)} className="field-input" />
          </div>
          <div className={group}>
            <label htmlFor={id("wstart")} className="field-label">Match window starts</label>
            <input id={id("wstart")} required type="datetime-local" value={windowStartsAt} onChange={(e) => setWindowStartsAt(e.target.value)} className="field-input" />
          </div>
          <div className={group}>
            <label htmlFor={id("wend")} className="field-label">Match window ends</label>
            <input id={id("wend")} required type="datetime-local" value={windowEndsAt} onChange={(e) => setWindowEndsAt(e.target.value)} className="field-input" />
          </div>
          <div className={group}>
            <label htmlFor={id("subs")} className="field-label">Submissions close</label>
            <input id={id("subs")} required type="datetime-local" value={submissionsCloseAt} onChange={(e) => setSubmissionsCloseAt(e.target.value)} className="field-input" />
          </div>
          <div className={group}>
            <label htmlFor={id("dispute")} className="field-label">Dispute window (minutes)</label>
            <input id={id("dispute")} required inputMode="numeric" value={disputeWindowMinutes} onChange={(e) => setDisputeWindowMinutes(e.target.value)} className="field-input" />
          </div>
        </div>
        <p className="text-[12px] text-muted">
          Entries must close before the match window starts, so nobody can enter after seeing a score. Players have until
          &ldquo;submissions close&rdquo; to upload evidence of a match played inside the window.
        </p>
      </fieldset>

      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary text-sm">
          {submitting ? "Saving…" : challengeId ? "Save draft" : "Create draft"}
        </button>
      </div>
    </form>
  );
}

/**
 * The prize-category editor: a list of prizes with fixed amounts, each ranked by the score or a number target, optionally
 * needing conditions, and optionally a combined prize paid to whoever wins several others. Below it, the money: what the
 * minimum field pays in, what the prizes add up to, the payout cap, and what the house keeps.
 */
function CategoryEditor({
  categories,
  setCategories,
  requirements,
  newKey,
  fee,
  lo,
  hi,
  maxPayoutBps,
}: {
  categories: FormCategory[];
  setCategories: React.Dispatch<React.SetStateAction<FormCategory[]>>;
  requirements: FormRequirement[];
  newKey: (prefix: string) => string;
  fee: number;
  lo: number;
  hi: number;
  maxPayoutBps: number;
}) {
  const uid = useId();
  const set = (i: number, patch: Partial<FormCategory>) => setCategories((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const targets = requirements.filter((r) => r.kind === "TARGET");
  const ordinary = categories.filter((c) => c.comboOf.length === 0);

  const amounts = categories.map((c) => ({ amount: Math.round(Number(c.amount) * 100) || 0 }));
  const total = worstCasePayout(amounts);
  const haveMoney = Number.isFinite(fee) && fee > 0 && Number.isInteger(lo) && lo > 0 && Number.isInteger(hi) && hi >= lo;
  const grossLo = haveMoney ? fee * lo : 0;
  const grossHi = haveMoney ? fee * hi : 0;
  const cap = Math.floor((grossLo * maxPayoutBps) / 10_000);
  const over = haveMoney && total > cap;

  const group = "flex flex-col gap-1.5";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-muted">
        Each prize has a fixed amount. Whatever isn&apos;t awarded — a prize nobody qualified for, a prize replaced by a combined one, or everything if nobody meets the
        target — stays with the house.
      </p>
      {categories.map((c, i) => {
        const isCombo = c.comboOf.length > 0;
        const others = ordinary.filter((o) => o.key !== c.key);
        return (
          <div key={c.key} className="flex flex-col gap-3 rounded-[8px] border border-border p-3">
            <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_140px_auto]">
              <div className={group}>
                <label htmlFor={`${uid}-n${i}`} className="field-label">Prize name</label>
                <input id={`${uid}-n${i}`} maxLength={60} value={c.name} onChange={(e) => set(i, { name: e.target.value })} className="field-input" placeholder="Kill Leader" />
              </div>
              <div className={group}>
                <label htmlFor={`${uid}-a${i}`} className="field-label">Amount (₦)</label>
                <input id={`${uid}-a${i}`} inputMode="decimal" value={c.amount} onChange={(e) => set(i, { amount: e.target.value })} className="field-input" />
              </div>
              <button type="button" className="btn-ghost text-sm" onClick={() => setCategories((cs) => cs.filter((_, j) => j !== i).map((x) => ({ ...x, comboOf: x.comboOf.filter((k) => k !== c.key) })))}>
                Remove
              </button>
            </div>
            {!isCombo ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={group}>
                  <label htmlFor={`${uid}-m${i}`} className="field-label">Ranked by</label>
                  <select id={`${uid}-m${i}`} value={c.metricKey} onChange={(e) => set(i, { metricKey: e.target.value })} className="field-select">
                    <option value="">The ranked score</option>
                    {targets.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label || "(unnamed target)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={group}>
                  <label htmlFor={`${uid}-p${i}`} className="field-label">Place that wins it</label>
                  <select id={`${uid}-p${i}`} value={c.place} onChange={(e) => set(i, { place: e.target.value })} className="field-select">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                      <option key={p} value={String(p)}>
                        {p === 1 ? "1st (the best)" : `${p}${p === 2 ? "nd" : p === 3 ? "rd" : "th"}`}
                      </option>
                    ))}
                  </select>
                </div>
                {requirements.length > 0 && (
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <span className="field-label">Also has to have met</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                      {requirements.map((r) => (
                        <label key={r.key} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={c.requires.includes(r.key)}
                            onChange={(e) => set(i, { requires: e.target.checked ? [...c.requires, r.key] : c.requires.filter((k) => k !== r.key) })}
                          />
                          {r.label || "(unnamed)"}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <span className="field-label">Paid to the player who wins all of</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  {others.map((o) => (
                    <label key={o.key} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={c.comboOf.includes(o.key)}
                        onChange={(e) => set(i, { comboOf: e.target.checked ? [...c.comboOf, o.key] : c.comboOf.filter((k) => k !== o.key) })}
                      />
                      {o.name || "(unnamed)"}
                    </label>
                  ))}
                </div>
                <span className="text-[12px] text-muted">That player gets this prize instead of those separate ones.</span>
              </div>
            )}
            <label className="flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" checked={isCombo} onChange={(e) => set(i, { comboOf: e.target.checked ? [ordinary.find((o) => o.key !== c.key)?.key ?? ""].filter(Boolean) : [] })} />
              This is a combined prize
            </label>
          </div>
        );
      })}
      {categories.length < 8 && (
        <button
          type="button"
          className="btn-secondary self-start text-sm"
          onClick={() => setCategories((cs) => [...cs, { key: newKey("c"), name: "", amount: "", metricKey: "", place: "1", requires: [], comboOf: [] }])}
        >
          Add a prize
        </button>
      )}

      {categories.length > 0 && (
        <p className={`rounded-[8px] border px-3 py-2 text-[13px] ${over ? "border-danger/50 bg-danger/10 text-foreground" : "border-border bg-surface-elevated text-muted"}`}>
          Prizes add up to <strong className="text-foreground">{naira(total)}</strong>.{" "}
          {haveMoney ? (
            <>
              At the minimum of {lo} players the entries bring {naira(grossLo)}, and the most you can promise is {naira(cap)} ({maxPayoutBps / 100}%
              of that, plus any sponsor). {over ? "That's too much — lower a prize or raise the minimum players. " : ""}If every prize is won the house keeps{" "}
              {naira(Math.max(0, grossLo - total))} at the minimum and {naira(Math.max(0, grossHi - total))} with {hi} players; if nobody qualifies it keeps all of it.
            </>
          ) : (
            "Set an entry fee and the minimum and maximum players to see what the house keeps."
          )}
        </p>
      )}
    </div>
  );
}
