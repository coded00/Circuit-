"use client";

import { useState } from "react";
import { Megaphone, X } from "lucide-react";

/**
 * Circuit — the one real Announcement the homepage shows (Content >
 * Announcements). Dismiss just hides it for this page view — no
 * per-user "seen" tracking, same "keep it minimal" scope as the rest of
 * this admin build.
 */
export function AnnouncementBanner({ title, body }: { title: string; body: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="alert alert-info items-center">
      <Megaphone size={16} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-foreground/80">{body}</span>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="shrink-0 text-info hover:opacity-70">
        <X size={16} />
      </button>
    </div>
  );
}
