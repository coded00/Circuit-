"use client";

/** Sound effects and haptics: kept on this device (not the account), on by default. */

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { feedback, getFeedbackPrefs, setFeedbackPrefs, type FeedbackPrefs } from "@/lib/feedback";

export default function PreferencesForm() {
  // Starts on the defaults the server rendered, then picks up this device's saved choice.
  const [prefs, setPrefs] = useState<FeedbackPrefs>({ sound: true, haptics: true });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once after hydration
    setPrefs(getFeedbackPrefs());
  }, []);

  function change(next: FeedbackPrefs) {
    setPrefs(next);
    setFeedbackPrefs(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Sound effects</h2>
          <p className="text-sm text-muted">Short sounds when something works, fails, or a notification arrives, and when a purchase goes through.</p>
        </div>
        <Switch checked={prefs.sound} label="Sound effects" onChange={(sound) => change({ ...prefs, sound })} />
      </section>

      <section className="card flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Haptics</h2>
          <p className="text-sm text-muted">A light buzz on button presses and results, on phones that support it.</p>
        </div>
        <Switch checked={prefs.haptics} label="Haptics" onChange={(haptics) => change({ ...prefs, haptics })} />
      </section>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={() => feedback("success")}>
          Try the success sound
        </button>
        <button type="button" className="btn-secondary" onClick={() => feedback("alert")}>
          Try the alert sound
        </button>
      </div>
      <p className="text-xs text-muted">These choices are saved on this device only.</p>
    </div>
  );
}
