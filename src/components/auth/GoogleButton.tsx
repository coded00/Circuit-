"use client";

/**
 * Circuit — "Continue with Google". A plain link to the server route that
 * starts the OAuth flow (full navigation, not client routing — it leaves
 * the site for Google). Uses Google's own multicolour "G" mark per their
 * sign-in branding guidelines (white "light" button), on Circuit's own
 * button shape — the familiar Google control, standing out on the dark
 * auth panel.
 */

import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ href, label = "Continue with Google" }: { href: string; label?: string }) {
  const [redirecting, setRedirecting] = useState(false);
  // Coming back with the browser's Back button can restore this page from
  // the back/forward cache with the spinner still showing.
  useEffect(() => {
    const reset = () => setRedirecting(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return (
    <a
      href={href}
      onClick={() => setRedirecting(true)}
      aria-busy={redirecting}
      className={`relative flex h-12 w-full items-center justify-center gap-3 cut-sm bg-white text-[15px] font-semibold text-[#1f1f1f] shadow-sm transition duration-[var(--duration-base)] hover:bg-white/90 active:scale-[0.99] ${
        redirecting ? "pointer-events-none opacity-80" : ""
      }`}
    >
      {redirecting ? <Spinner size={18} /> : <GoogleMark />}
      {redirecting ? "Redirecting to Google…" : label}
    </a>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-muted-strong uppercase">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function googleStartHref(from: "login" | "signup", next: string): string {
  const params = new URLSearchParams({ intent: "signin", from });
  if (next && next !== "/") params.set("next", next);
  return `/api/auth/google?${params.toString()}`;
}
