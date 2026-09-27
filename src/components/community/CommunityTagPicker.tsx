"use client";

/**
 * Circuit — pick which community tag shows next to your name (on your
 * profile and in every chat), like Discord's server tags. Only
 * communities you're in that have a tag are offered.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

type Option = { id: string; name: string; tag: string };

export function CommunityTagPicker({ options, current }: { options: Option[]; current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: string) {
    setValue(next);
    setState("saving");
    const res = await fetch("/api/account/featured-community", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communityId: next || null }),
    }).catch(() => null);
    setState(res?.ok ? "saved" : "error");
    if (res?.ok) router.refresh();
  }

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-section-heading">Community tag</h2>
        <p className="text-sm text-muted">Show a community&apos;s tag next to your name on your profile and in chat.</p>
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-muted">None of your communities have a tag yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save("")}
            aria-pressed={value === ""}
            className={`h-9 rounded-full border px-3.5 text-sm font-semibold transition ${value === "" ? "border-foreground bg-foreground text-background" : "border-border hover:border-border-hover"}`}
          >
            No tag
          </button>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => save(o.id)}
              aria-pressed={value === o.id}
              className={`flex h-9 items-center gap-2 rounded-full border pr-3.5 pl-2 text-sm font-semibold transition ${
                value === o.id ? "border-foreground bg-foreground text-background" : "border-border hover:border-border-hover"
              }`}
            >
              <span className="rounded-[5px] border border-current/30 px-1 font-mono text-[11px]">{o.tag}</span>
              {o.name}
            </button>
          ))}
        </div>
      )}
      {state === "saved" && (
        <p className="flex items-center gap-1 text-xs text-success">
          <Check size={13} /> Saved
        </p>
      )}
      {state === "error" && <p className="field-error">Couldn&apos;t save — try again.</p>}
    </section>
  );
}
