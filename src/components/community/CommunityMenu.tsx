"use client";

/**
 * Circuit — the "…" menu in a community's chat header: invite people,
 * about, settings (moderators), leave. Inviting creates a link that
 * previews properly when pasted into WhatsApp/X (see /invite/[code]).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Copy, Flag, Info, LogOut, MoreHorizontal, Settings, Trophy, UserPlus } from "lucide-react";
import { CreateEventDialog } from "./EventControls";
import { ReportDialog } from "./ReportDialog";
import { DialogOverlay } from "@/components/ui/Overlay";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";

export type CommunityMenuProps = {
  communityId: string;
  communityName: string;
  canInvite: boolean;
  aboutHref?: string;
  settingsHref?: string;
  /** Moderators: create a tournament hosted by this community. */
  hostHref?: string;
  /** Moderators: the community's base path, enabling "Create event". */
  eventsHref?: string;
  canLeave: boolean;
};

export function CommunityMenu({ communityId, communityName, canInvite, aboutHref, settingsHref, hostHref, eventsHref, canLeave }: CommunityMenuProps) {
  const router = useRouter();
  const confirm = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function leave() {
    setOpen(false);
    const ok = await confirm({ title: `Leave ${communityName}?`, message: "You can rejoin later if it's still open.", confirmLabel: "Leave" });
    if (!ok) return;
    const res = await fetch(`/api/communities/${communityId}/join`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.replace("/communities");
      router.refresh();
    } else {
      await confirm({ title: "Couldn't leave", message: (await res?.json().catch(() => null))?.error ?? "Try again.", confirmLabel: "OK", danger: false });
    }
  }

  const item = "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition hover:bg-surface-elevated";

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        {canInvite && (
          <button type="button" onClick={() => setInviting(true)} className="btn-secondary hidden h-9 gap-1.5 px-3 text-sm sm:flex">
            <UserPlus size={15} /> Invite
          </button>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Community options" aria-expanded={open} className="btn-icon">
          <MoreHorizontal size={18} />
        </button>
      </div>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1.5 w-52 overflow-hidden rounded-[12px] border border-border bg-surface py-1" style={{ boxShadow: "var(--shadow-float)" }}>
          {canInvite && (
            <button type="button" className={item} onClick={() => (setOpen(false), setInviting(true))}>
              <UserPlus size={15} /> Invite people
            </button>
          )}
          {aboutHref && (
            <Link href={aboutHref} className={item} onClick={() => setOpen(false)}>
              <Info size={15} /> About
            </Link>
          )}
          {eventsHref && (
            <button type="button" className={item} onClick={() => (setOpen(false), setCreatingEvent(true))}>
              <CalendarPlus size={15} /> Create event
            </button>
          )}
          {hostHref && (
            <Link href={hostHref} className={item} onClick={() => setOpen(false)}>
              <Trophy size={15} /> Host a tournament
            </Link>
          )}
          {settingsHref && (
            <Link href={settingsHref} className={item} onClick={() => setOpen(false)}>
              <Settings size={15} /> Settings
            </Link>
          )}
          {!settingsHref && (
            <button type="button" className={item} onClick={() => (setOpen(false), setReporting(true))}>
              <Flag size={15} /> Report community
            </button>
          )}
          {canLeave && (
            <button type="button" className={`${item} text-danger`} onClick={leave}>
              <LogOut size={15} /> Leave community
            </button>
          )}
        </div>
      )}
      {eventsHref && <CreateEventDialog communityId={communityId} open={creatingEvent} onClose={() => setCreatingEvent(false)} communityHref={eventsHref} />}
      <ReportDialog open={reporting} onClose={() => setReporting(false)} target={{ targetType: "COMMUNITY", communityId }} title={`Report ${communityName}`} />
      {canInvite && <InviteDialog open={inviting} onClose={() => setInviting(false)} communityId={communityId} communityName={communityName} />}
    </div>
  );
}

const EXPIRY = [
  { hours: 24, label: "1 day" },
  { hours: 168, label: "7 days" },
  { hours: 0, label: "Never" },
];
const USES = [
  { uses: 0, label: "No limit" },
  { uses: 1, label: "1 use" },
  { uses: 10, label: "10" },
  { uses: 100, label: "100" },
];

export function InviteDialog({ open, onClose, communityId, communityName }: { open: boolean; onClose: () => void; communityId: string; communityName: string }) {
  const [hours, setHours] = useState(168);
  const [uses, setUses] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/communities/${communityId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInHours: hours || undefined, maxUses: uses || undefined }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(data?.error ?? "Couldn't create a link.");
    setUrl(`${window.location.origin}/invite/${data.code}`);
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const text = `Join ${communityName} on Circuit`;
  const chip = (on: boolean) =>
    `h-9 cut-xs border px-3.5 text-sm font-semibold transition ${on ? "border-foreground bg-foreground text-background" : "border-border hover:border-border-hover"}`;

  return (
    <DialogOverlay
      open={open}
      onClose={() => {
        onClose();
        setUrl(null);
      }}
      label="Invite people"
      maxWidth={460}
    >
      <div className="flex flex-col gap-4 px-5 pb-5 sm:pt-5">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Invite</p>
          <h2 className="font-display text-xl font-bold tracking-tight">Bring your people to {communityName}</h2>
        </div>
        {url ? (
          <>
            <div className="flex items-center gap-2 rounded-[12px] border border-border bg-surface-elevated/40 p-1.5 pl-3.5">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{url.replace(/^https?:\/\//, "")}</span>
              <button type="button" onClick={copy} className="btn-primary h-9 gap-1.5 px-3.5 text-sm">
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${text}: ${url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary h-11 text-sm"
              >
                Share on WhatsApp
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary h-11 text-sm"
              >
                Post on X
              </a>
            </div>
            <button type="button" onClick={() => setUrl(null)} className="text-sm font-medium text-muted hover:text-foreground">
              Make a different link
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Link expires after</span>
              <div className="flex flex-wrap gap-2">
                {EXPIRY.map((e) => (
                  <button key={e.hours} type="button" onClick={() => setHours(e.hours)} className={chip(hours === e.hours)}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Max uses</span>
              <div className="flex flex-wrap gap-2">
                {USES.map((u) => (
                  <button key={u.uses} type="button" onClick={() => setUses(u.uses)} className={chip(uses === u.uses)}>
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="field-error">{error}</p>}
            <button type="button" onClick={create} disabled={busy} className="btn-primary h-11 w-full">
              {busy ? "Creating…" : "Create invite link"}
            </button>
          </>
        )}
      </div>
    </DialogOverlay>
  );
}
