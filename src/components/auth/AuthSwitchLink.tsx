"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/safeRedirect";

/** Circuit — the "Need an account? / Already have one?" link under both sign-in methods, carrying `next` across. */
export function AuthSwitchLink({ to }: { to: "login" | "signup" }) {
  const next = safeNextPath(useSearchParams().get("next"));
  const query = next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <p className="text-center text-sm text-muted">
      {to === "signup" ? "New to Circuit? " : "Already have an account? "}
      <Link href={`/${to}${query}`} className="font-semibold text-foreground hover:underline">
        {to === "signup" ? "Create an account" : "Log in"}
      </Link>
    </p>
  );
}
