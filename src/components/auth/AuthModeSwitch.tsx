"use client";

/**
 * Circuit — the Log in / Sign up switch at the top of both pages, so
 * moving between them is one tap at the top rather than a footnote
 * under the form. Carries `next` across.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safeRedirect";

export function AuthModeSwitch({ active }: { active: "login" | "signup" }) {
  const next = safeNextPath(useSearchParams().get("next"));
  const query = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <nav aria-label="Log in or sign up" className="grid grid-cols-2 cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] bg-white/[0.03] p-1">
      {(["login", "signup"] as const).map((mode) => {
        const on = mode === active;
        return (
          <Link
            key={mode}
            href={`/${mode}${query}`}
            aria-current={on ? "page" : undefined}
            className={`rounded-none py-2 text-center text-sm font-semibold transition ${
              on ? "bg-surface-elevated text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {mode === "login" ? "Log in" : "Sign up"}
          </Link>
        );
      })}
    </nav>
  );
}
