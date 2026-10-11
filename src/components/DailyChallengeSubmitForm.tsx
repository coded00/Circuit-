"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { guessScoreFromText } from "@/lib/evidenceCheck";

export type SubmitRequirement = {
  id: string;
  kind: "CONDITION" | "TARGET";
  /** Already worded for a player: "Win the match", "At least 10 — kills". */
  text: string;
  unit: string | null;
};

/**
 * Circuit — the form a player fills in after their match: the number, the scoreboard screenshot, and an answer for
 * every requirement. One submission per entry, so the button asks before sending. What is typed here is a claim —
 * staff check it against the evidence — and the form says so, so nobody thinks the number alone decides anything.
 */
export function DailyChallengeSubmitForm({
  challengeId,
  metricLabel,
  metricUnit,
  tiebreakLabel,
  requireRecording,
  requirements,
}: {
  challengeId: string;
  metricLabel: string;
  metricUnit: string | null;
  tiebreakLabel: string | null;
  requireRecording: boolean;
  requirements: SubmitRequirement[];
}) {
  const router = useRouter();
  const uid = useId();
  const [score, setScore] = useState("");
  const [tiebreak, setTiebreak] = useState("");
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<File | null>(null);
  const [recording, setRecording] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Reads the screenshot in the browser (nothing is uploaded for this) and offers the number next to the stat's label.
   * It only fills the box to save typing: the player must check it, and staff still verify the real score from the file.
   */
  async function readScore() {
    if (!evidence) return;
    setReading(true);
    setReadNote(null);
    try {
      const { recognize } = await import("tesseract.js");
      const { data } = await recognize(evidence, "eng");
      const words = metricLabel.toLowerCase().split(/\s+/);
      const guess = guessScoreFromText(data.text, [metricLabel, words[words.length - 1] ?? ""]);
      if (guess === null) {
        setReadNote("Couldn't read your result from this screenshot. Type it in.");
      } else {
        setScore(String(guess));
        setReadNote(`Read ${guess} from your screenshot. Check it's right before you submit.`);
      }
    } catch {
      setReadNote("Couldn't read the screenshot here. Type your result in.");
    } finally {
      setReading(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("score", score);
    if (tiebreakLabel) form.set("tiebreakScore", tiebreak);
    form.set(
      "claims",
      JSON.stringify(requirements.map((r) => (r.kind === "CONDITION" ? { requirementId: r.id, claimedMet: !!ticks[r.id] } : { requirementId: r.id, claimedValue: values[r.id] ?? "" }))),
    );
    if (evidence) form.set("evidence", evidence);
    if (recording) form.set("recording", recording);
    const res = await fetch(`/api/daily-challenges/${challengeId}/submit`, { method: "POST", body: form });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  const ready = score.trim() !== "" && !!evidence && (!tiebreakLabel || tiebreak.trim() !== "") && (!requireRecording || !!recording) && requirements.every((r) => (r.kind === "TARGET" ? (values[r.id] ?? "").trim() !== "" : true));
  const field = "flex flex-col gap-1.5";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Played your match? Enter your result and upload the full match-end scoreboard. Staff check what you submit against the screenshot — you can only submit once.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={field}>
          <label htmlFor={`${uid}-score`} className="field-label">
            Your {metricLabel.toLowerCase()}
            {metricUnit ? ` (${metricUnit})` : ""}
          </label>
          <input id={`${uid}-score`} inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} className="field-input" />
        </div>
        {tiebreakLabel && (
          <div className={field}>
            <label htmlFor={`${uid}-tb`} className="field-label">Your {tiebreakLabel.toLowerCase()}</label>
            <input id={`${uid}-tb`} inputMode="numeric" value={tiebreak} onChange={(e) => setTiebreak(e.target.value)} className="field-input" />
          </div>
        )}
      </div>

      {requirements.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted uppercase">Requirements</p>
          {requirements.map((r, i) =>
            r.kind === "CONDITION" ? (
              <label key={r.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={!!ticks[r.id]} onChange={(e) => setTicks((t) => ({ ...t, [r.id]: e.target.checked }))} className="mt-1" />
                <span>I met this: {r.text}</span>
              </label>
            ) : (
              <div key={r.id} className={field}>
                <label htmlFor={`${uid}-r${i}`} className="text-sm">{r.text}</label>
                <input
                  id={`${uid}-r${i}`}
                  inputMode="numeric"
                  value={values[r.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value }))}
                  className="field-input sm:w-40"
                  placeholder={r.unit ?? "Your number"}
                />
              </div>
            ),
          )}
        </div>
      )}

      <div className={field}>
        <label htmlFor={`${uid}-ev`} className="field-label">Scoreboard screenshot</label>
        <input id={`${uid}-ev`} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} className="text-sm" />
        <span className="text-xs text-muted">PNG, JPEG, GIF or WebP, up to 10MB. It has to show your in-game name and the final result.</span>
        {evidence && (
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={readScore} disabled={reading} className="btn-ghost">
              {reading ? "Reading…" : "Fill in my result from the screenshot"}
            </button>
            {readNote && <span className="text-xs text-muted" role="status">{readNote}</span>}
          </span>
        )}
      </div>
      {requireRecording && (
        <div className={field}>
          <label htmlFor={`${uid}-rec`} className="field-label">Screen recording (required)</label>
          <input id={`${uid}-rec`} type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setRecording(e.target.files?.[0] ?? null)} className="text-sm" />
          <span className="text-xs text-muted">MP4, MOV or WebM, up to 10MB — a short clip of the match and its result.</span>
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
      {confirming ? (
        <div className="flex flex-col gap-2 border border-border-strong bg-surface-elevated p-3">
          <p className="text-sm">Send this to staff? You can&apos;t change it afterwards.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={send} className="btn-primary">
              {busy ? "Sending…" : "Yes, submit"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="btn-ghost">
              Go back
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!ready} onClick={() => setConfirming(true)} className="btn-primary self-start">
          Submit score
        </button>
      )}
    </div>
  );
}
