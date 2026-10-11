"use client";

/** Privacy: show up in search, and who can send a direct challenge. Saves as you change it. */

import { useState } from "react";
import type { DirectChallengePolicy } from "@prisma/client";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ToastProvider";

type Policy = DirectChallengePolicy;

const POLICY_OPTIONS: { value: Policy; title: string; hint: string }[] = [
  { value: "ANYONE", title: "Anyone", hint: "Any player can challenge you directly." },
  { value: "FRIENDS", title: "Friends only", hint: "Only your friends can. Everyone else is skipped, including Quick Match." },
  { value: "NOBODY", title: "Nobody", hint: "No direct challenges. You can still accept challenges from the open board." },
];

export default function PrivacyForm({ initialSearchable, initialSearchEngineIndexable, initialPolicy }: { initialSearchable: boolean; initialSearchEngineIndexable: boolean; initialPolicy: Policy }) {
  const toast = useToast();
  const [searchable, setSearchable] = useState(initialSearchable);
  const [indexable, setIndexable] = useState(initialSearchEngineIndexable);
  const [policy, setPolicy] = useState<Policy>(initialPolicy);
  const [saving, setSaving] = useState(false);

  async function save(change: { searchable?: boolean; searchEngineIndexable?: boolean; directChallenges?: Policy }, revert: () => void) {
    setSaving(true);
    const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) }).catch(() => null);
    const ok = res?.ok ?? false;
    setSaving(false);
    if (ok) toast({ title: "Privacy updated" });
    else {
      revert();
      toast({ title: "Couldn't save that", message: "Check your connection and try again.", tone: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="card flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Show me in search and Discover</h2>
          <p className="text-sm text-muted">Turn this off and you won&apos;t appear when players search or browse Discover. Your profile still opens from its link.</p>
        </div>
        <Switch
          checked={searchable}
          label="Show me in search and Discover"
          disabled={saving}
          onChange={(next) => {
            setSearchable(next);
            void save({ searchable: next }, () => setSearchable(!next));
          }}
        />
      </section>

      <section className="card flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Show my profile on Google</h2>
          <p className="text-sm text-muted">Let search engines list your public profile, so people can find you by name. Off by default, and only available to players 18 and over who have played a match. Your profile still opens from its link either way.</p>
        </div>
        <Switch
          checked={indexable}
          label="Show my profile on Google"
          disabled={saving}
          onChange={(next) => {
            setIndexable(next);
            void save({ searchEngineIndexable: next }, () => setIndexable(!next));
          }}
        />
      </section>

      <fieldset className="card flex flex-col gap-3" disabled={saving}>
        <legend className="sr-only">Who can challenge me directly</legend>
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Who can challenge me directly</h2>
          <p className="text-sm text-muted">Applies to a challenge sent to you and to Quick Match. Blocked players can never do either.</p>
        </div>
        <div className="flex flex-col gap-2">
          {POLICY_OPTIONS.map((o) => (
            <label key={o.value} className={`flex cursor-pointer items-start gap-3 cut-sm border p-3.5 transition ${policy === o.value ? "border-accent-volt bg-accent-volt-soft" : "border-border hover:border-border-strong"}`}>
              <input
                type="radio"
                name="directChallenges"
                value={o.value}
                checked={policy === o.value}
                onChange={() => {
                  const previous = policy;
                  setPolicy(o.value);
                  void save({ directChallenges: o.value }, () => setPolicy(previous));
                }}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{o.title}</span>
                <span className="text-[13px] text-muted">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
