"use client";

/**
 * Circuit — share a Challenge/Tournament link externally. `navigator.share`
 * (mobile Safari/Chrome, most PWA contexts) hands off to the OS's own share
 * sheet — WhatsApp, Instagram, TikTok, Messages, whatever's installed —
 * without Circuit needing to know any of those apps exist. That's the only
 * honest way to reach Instagram/TikTok specifically: neither publishes a
 * web share-intent URL the way WhatsApp/X/Facebook do, so the desktop
 * fallback below copies the link for those two instead of pretending a
 * deep link exists.
 */

import { useEffect, useRef, useState } from "react";
import { Share2, Link2, Check, ArrowUpRight, MessageCircle, MoreHorizontal } from "lucide-react";

const X_LOGO = (
  <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden>
    <path d="M18.9 2H22l-7.6 8.7L23 22h-6.8l-5.3-6.9L4.8 22H1.7l8.1-9.3L1 2h7l4.8 6.3L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z" />
  </svg>
);

function useShareState(url: string) {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return { copied, copyLink };
}

function externalTargets(url: string, title: string) {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(title);
  return [
    { label: "WhatsApp", href: `https://api.whatsapp.com/send?text=${encodedText}%20${encodedUrl}` },
    { label: "X (Twitter)", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
  ];
}

async function tryNativeShare(title: string, url: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  try {
    await navigator.share({ title, url });
  } catch {
    // user cancelled the native share sheet — nothing else to do
  }
  return true;
}

export function ShareButton({
  title,
  url,
  variant = "button",
}: {
  title: string;
  url: string;
  /** "button": labeled `.btn-secondary` trigger (default). "compact":
   *  icon-only `.btn-icon` trigger, for tight spaces like a card header.
   *  Both open a dropdown on desktop, or hand off to the native share
   *  sheet where available. "inline": a row of quick icon buttons (Copy,
   *  X, WhatsApp) plus a "More" trigger for the rest — for a dedicated
   *  "Share" sidebar card that shouldn't hide everything behind one click. */
  variant?: "button" | "compact" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const { copied, copyLink } = useShareState(url);
  const ref = useRef<HTMLDivElement>(null);
  const targets = externalTargets(url, title);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function handleTriggerClick() {
    if (await tryNativeShare(title, url)) return;
    setOpen((v) => !v);
  }

  const dropdown = open && (
    <div className="dropdown-panel absolute right-0 z-20 mt-2 w-60 py-1" role="menu">
      {targets.map((t) => (
        <a
          key={t.label}
          href={t.href}
          target="_blank"
          rel="noreferrer"
          role="menuitem"
          onClick={() => setOpen(false)}
          className="flex items-center justify-between px-4 py-2 text-sm hover:bg-surface-elevated"
        >
          {t.label}
          <ArrowUpRight size={14} className="text-muted" />
        </a>
      ))}

      <div className="my-1 border-t border-border" />

      {["Instagram", "TikTok"].map((label) => (
        <button
          key={label}
          type="button"
          role="menuitem"
          onClick={copyLink}
          className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-surface-elevated"
        >
          {label}
          <span className="text-metadata">Copy link</span>
        </button>
      ))}

      <div className="my-1 border-t border-border" />

      <button
        type="button"
        role="menuitem"
        onClick={copyLink}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-surface-elevated"
      >
        {copied ? "Link copied" : "Copy link"}
        {copied ? <Check size={14} className="text-success" /> : <Link2 size={14} className="text-muted" />}
      </button>
    </div>
  );

  if (variant === "inline") {
    return (
      <div ref={ref} className="relative flex items-center gap-2">
        <button type="button" onClick={copyLink} aria-label="Copy link" className="btn-icon">
          {copied ? <Check size={15} className="text-success" /> : <Link2 size={15} />}
        </button>
        <a
          href={targets[1].href}
          target="_blank"
          rel="noreferrer"
          aria-label="Share to X"
          className="btn-icon"
        >
          {X_LOGO}
        </a>
        <a
          href={targets[0].href}
          target="_blank"
          rel="noreferrer"
          aria-label="Share to WhatsApp"
          className="btn-icon"
        >
          <MessageCircle size={16} />
        </a>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="More share options" className="btn-icon">
          <MoreHorizontal size={16} />
        </button>
        {dropdown}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      {variant === "compact" ? (
        <button
          type="button"
          onClick={handleTriggerClick}
          className="btn-icon"
          aria-label="Share"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Share2 size={16} />
        </button>
      ) : (
        <button type="button" onClick={handleTriggerClick} className="btn-secondary" aria-haspopup="menu" aria-expanded={open}>
          <Share2 size={14} />
          Share
        </button>
      )}
      {dropdown}
    </div>
  );
}
