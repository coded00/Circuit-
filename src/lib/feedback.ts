/**
 * Circuit — sound and haptics. Small synthesized sounds (no audio files to
 * load or host) and phone vibration, for the moments that matter: something
 * worked, something failed, an alert arrived, a purchase went through.
 * Both are on by default and can be switched off in Account settings. Sound
 * only ever plays after the player has touched the page (browsers require it),
 * and never while the tab is hidden. Browser-only; every function is a no-op
 * on the server.
 */

const KEY = "circuit-feedback";

export type FeedbackPrefs = { sound: boolean; haptics: boolean };
export type FeedbackKind = "success" | "error" | "alert" | "purchase" | "tap";

const DEFAULTS: FeedbackPrefs = { sound: true, haptics: true };

export function getFeedbackPrefs(): FeedbackPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function setFeedbackPrefs(next: FeedbackPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the choice just won't survive a reload.
  }
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

/** One note: a short envelope so it clicks on and fades, never pops. */
function note(c: AudioContext, at: number, freq: number, ms: number, type: OscillatorType, gain: number) {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  osc.connect(amp).connect(c.destination);
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.02);
}

const SOUNDS: Record<FeedbackKind, (c: AudioContext, t: number) => void> = {
  tap: (c, t) => note(c, t, 620, 40, "square", 0.025),
  success: (c, t) => {
    note(c, t, 523, 110, "triangle", 0.07);
    note(c, t + 0.09, 784, 170, "triangle", 0.07);
  },
  purchase: (c, t) => {
    note(c, t, 523, 90, "triangle", 0.07);
    note(c, t + 0.08, 659, 90, "triangle", 0.07);
    note(c, t + 0.16, 988, 220, "triangle", 0.07);
  },
  error: (c, t) => {
    note(c, t, 196, 140, "sawtooth", 0.04);
    note(c, t + 0.12, 147, 200, "sawtooth", 0.04);
  },
  alert: (c, t) => {
    note(c, t, 880, 90, "sine", 0.06);
    note(c, t + 0.11, 1175, 130, "sine", 0.06);
  },
};

const HAPTICS: Record<FeedbackKind, number | number[]> = {
  tap: 8,
  success: [12, 40, 18],
  purchase: [14, 40, 14, 40, 24],
  error: [30, 50, 30],
  alert: [10, 30, 10],
};

export function feedback(kind: FeedbackKind): void {
  if (typeof window === "undefined" || document.visibilityState !== "visible") return;
  const prefs = getFeedbackPrefs();
  if (prefs.haptics && "vibrate" in navigator) {
    try {
      navigator.vibrate(HAPTICS[kind]);
    } catch {
      // Not supported here.
    }
  }
  if (prefs.sound && kind !== "tap") {
    const c = audio();
    if (c) SOUNDS[kind](c, c.currentTime + 0.01);
  }
}
