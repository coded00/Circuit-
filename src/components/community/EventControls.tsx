"use client";

/** Circuit — RSVP buttons for a community event, and the moderators' "create event" dialog. */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Star } from "lucide-react";
import { DialogOverlay } from "@/components/ui/Overlay";

type Status = "GOING" | "INTERESTED" | null;

export function RsvpButtons({
  eventId,
  initialStatus,
  initialCounts,
  canRsvp,
  blockedReason,
}: {
  eventId: string;
  initialStatus: Status;
  initialCounts: { going: number; interested: number };
  /** Signed in, a member, event not over or cancelled. */
  canRsvp: boolean;
  /** Shown instead of the buttons when they can't RSVP (e.g. a sign-up link). */
  blockedReason?: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [counts, setCounts] = useState(initialCounts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(next: Exclude<Status, null>) {
    const value = status === next ? null : next;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/community-events/${eventId}/rsvp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: value }) }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(data?.error ?? "Couldn't save your RSVP.");
    setStatus(value);
    setCounts(data);
    router.refresh();
  }

  const btn = (on: boolean) =>
    `flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[12px] border text-sm font-semibold transition sm:flex-none sm:px-5 ${
      on ? "border-accent-volt bg-accent-volt text-accent-volt-foreground" : "border-border bg-surface hover:border-border-hover"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted">
        <span className="font-semibold text-foreground">{counts.going}</span> going · <span className="font-semibold text-foreground">{counts.interested}</span> interested
      </p>
      {canRsvp ? (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => choose("GOING")} aria-pressed={status === "GOING"} className={btn(status === "GOING")}>
            <Check size={16} /> {status === "GOING" ? "Going" : "I'm going"}
          </button>
          <button type="button" disabled={busy} onClick={() => choose("INTERESTED")} aria-pressed={status === "INTERESTED"} className={btn(status === "INTERESTED")}>
            <Star size={15} /> Interested
          </button>
        </div>
      ) : (
        blockedReason
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/** Local datetime-local value for "now + hours", rounded to the half hour. */
function defaultStart(): string {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CreateEventDialog({ communityId, open, onClose, communityHref }: { communityId: string; open: boolean; onClose: () => void; communityHref: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/communities/${communityId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        location,
        description,
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(data?.error ?? "Couldn't create the event.");
    onClose();
    router.push(`${communityHref}/events/${data.id}`);
  }

  return (
    <DialogOverlay open={open} onClose={onClose} label="Create event" maxWidth={480}>
      <form onSubmit={submit} className="flex flex-col gap-3 px-5 pb-5 sm:pt-5">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">New event</p>
          <h2 className="font-display text-xl font-bold tracking-tight">What&apos;s happening?</h2>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. FIFA Night" className="field-input h-11" aria-label="Event title" required />
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Starts
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="field-input h-11 text-sm text-foreground" required />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Ends (optional)
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="field-input h-11 text-sm text-foreground" />
          </label>
        </div>
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="Where. E.g. Online (#general) or a venue" className="field-input h-11" aria-label="Location" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} placeholder="Details (optional)" className="field-input resize-none" aria-label="Details" />
        {error && <p className="field-error">{error}</p>}
        <button type="submit" disabled={busy || title.trim().length < 3} className="btn-primary h-11">
          {busy ? "Creating…" : "Create & announce"}
        </button>
      </form>
    </DialogOverlay>
  );
}

export function CreateEventButton({ communityId, communityHref }: { communityId: string; communityHref: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary h-9 gap-1.5 px-3 text-sm">
        <CalendarPlus size={15} /> Create event
      </button>
      <CreateEventDialog communityId={communityId} open={open} onClose={() => setOpen(false)} communityHref={communityHref} />
    </>
  );
}

export function SignUpToRsvp({ href }: { href: string }) {
  return (
    <Link href={href} className="btn-primary h-11 w-full sm:w-fit sm:px-6">
      Sign up to RSVP
    </Link>
  );
}
