/**
 * Circuit — the welcome screen: the first thing someone new sees before
 * choosing to sign up or log in. Same launcher-style shell as the auth
 * pages (key art on the right stays put), with the brand statement and
 * the two ways in. Already signed in: nothing to do here, go home.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { AuthSplitLayout } from "@/components/auth/AuthSplitLayout";

export const metadata: Metadata = {
  title: "Welcome to Circuit",
  description: "Play. Compete. Build your name. Tournaments, 1v1 challenges and real prizes for Nigerian gamers.",
};

export default async function StartPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <AuthSplitLayout>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2.5 font-mono text-[11px] font-semibold tracking-[0.16em] text-accent-volt uppercase">
            <span className="h-px w-6 bg-accent-volt" aria-hidden />
            Welcome to Circuit
          </p>
          <h1 className="font-display text-[56px] leading-[0.92] font-bold tracking-tight uppercase sm:text-[68px]">
            Play.
            <br />
            Compete.
            <br />
            <span className="text-accent-volt">Build your name.</span>
          </h1>
          <p className="max-w-[380px] text-[15px] leading-relaxed text-muted">
            Enter tournaments, call out rivals and build a record that follows you across every game you play.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/signup" className="btn-primary h-12 w-full gap-2 text-[15px]">
            Create account <ArrowRight size={16} />
          </Link>
          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-[var(--radius-control)] border border-white/[0.12] text-[15px] font-semibold transition hover:border-white/25 hover:bg-white/[0.04] active:scale-[0.99]"
          >
            Log in
          </Link>
          <Link href="/compete" className="mt-1 text-center text-sm font-medium text-muted transition hover:text-foreground">
            Just looking? Browse tournaments
          </Link>
        </div>
      </div>
    </AuthSplitLayout>
  );
}
