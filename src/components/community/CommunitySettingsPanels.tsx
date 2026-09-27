"use client";

/**
 * Circuit — the interactive parts of a community's settings: channels,
 * members & bans, invite links, the application queue and closing the
 * community. Each action calls its API route and refreshes the page.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, Copy, Crown, Hash, Lock, LockOpen, Pencil, Plus, Shield, Trash2, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { InviteDialog } from "./CommunityMenu";

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    return (await res.json().catch(() => null))?.error ?? "Something went wrong.";
  } catch {
    return "We couldn't reach Circuit. Check your connection.";
  }
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(key: string, url: string, method: string, body?: unknown) {
    setBusy(key);
    setError(null);
    const err = await call(url, method, body);
    setBusy(null);
    if (err) setError(err);
    else router.refresh();
    return !err;
  }
  return { busy, error, run, setError };
}

const rowBtn = "flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:opacity-40";

// ---------------------------------------------------------------------------

type ChannelRow = { id: string; key: string; name: string; modOnly: boolean };
const BUILT_IN = new Set(["general", "announcements", "matches", "results"]);

export function ChannelManager({ communityId, channels }: { communityId: string; channels: ChannelRow[] }) {
  const confirm = useConfirmDialog();
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [newModOnly, setNewModOnly] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (await run("add", `/api/communities/${communityId}/channels`, "POST", { name: newName, modOnly: newModOnly })) {
      setNewName("");
      setNewModOnly(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-border rounded-[14px] border border-border bg-surface">
        {channels.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <Hash size={15} className="shrink-0 text-muted" />
            {editing === c.id ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(`name-${c.id}`, `/api/communities/${communityId}/channels/${c.id}`, "PATCH", { name: draft })) setEditing(null);
                }}
              >
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="field-input h-9 min-w-0 flex-1" maxLength={24} />
                <button type="submit" className={rowBtn} aria-label="Save name">
                  <Check size={15} />
                </button>
                <button type="button" onClick={() => setEditing(null)} className={rowBtn} aria-label="Cancel">
                  <X size={15} />
                </button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                {c.modOnly && <span className="badge badge-neutral hidden sm:inline-flex">Mods post</span>}
                <button type="button" className={rowBtn} onClick={() => (setEditing(c.id), setDraft(c.name))} aria-label={`Rename #${c.name}`}>
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className={rowBtn}
                  disabled={busy !== null}
                  onClick={() => run(`lock-${c.id}`, `/api/communities/${communityId}/channels/${c.id}`, "PATCH", { modOnly: !c.modOnly })}
                  aria-label={c.modOnly ? "Let everyone post" : "Only moderators post"}
                  title={c.modOnly ? "Let everyone post" : "Only moderators post"}
                >
                  {c.modOnly ? <Lock size={14} /> : <LockOpen size={14} />}
                </button>
                <button type="button" className={rowBtn} disabled={i === 0 || busy !== null} onClick={() => run(`up-${c.id}`, `/api/communities/${communityId}/channels/${c.id}`, "PATCH", { move: "up" })} aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className={rowBtn}
                  disabled={i === channels.length - 1 || busy !== null}
                  onClick={() => run(`down-${c.id}`, `/api/communities/${communityId}/channels/${c.id}`, "PATCH", { move: "down" })}
                  aria-label="Move down"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  className={`${rowBtn} hover:text-danger`}
                  disabled={BUILT_IN.has(c.key) || busy !== null}
                  title={BUILT_IN.has(c.key) ? "Built-in channels can be renamed, not deleted" : undefined}
                  onClick={async () => {
                    if (await confirm({ title: `Delete #${c.name}?`, message: "Every message in it is deleted too.", confirmLabel: "Delete channel" })) {
                      run(`del-${c.id}`, `/api/communities/${communityId}/channels/${c.id}`, "DELETE");
                    }
                  }}
                  aria-label={`Delete #${c.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center rounded-[10px] border border-border bg-surface focus-within:border-border-strong">
          <Hash size={15} className="ml-3 text-muted" />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new-channel" maxLength={24} className="h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" aria-label="New channel name" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={newModOnly} onChange={(e) => setNewModOnly(e.target.checked)} className="h-4 w-4 accent-[var(--accent-volt)]" />
          Mods only post
        </label>
        <button type="submit" disabled={!newName.trim() || busy === "add"} className="btn-secondary h-11 gap-1.5 px-4">
          <Plus size={15} /> Add channel
        </button>
      </form>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Member = { userId: string; handle: string; displayName: string; avatarUrl: string | null; role: "OWNER" | "MODERATOR" | "MEMBER"; joinedAt: string; mutedUntil: string | null };
type Ban = { userId: string; handle: string; displayName: string; reason: string | null };

function Avatar({ name, url }: { name: string; url: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element -- external avatar
  if (url) return <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted">{name.slice(0, 1).toUpperCase()}</span>;
}

export function MemberManager({
  communityId,
  members,
  bans,
  viewerId,
  viewerIsOwner,
  viewerIsStaff,
  canTransfer,
}: {
  communityId: string;
  members: Member[];
  bans: Ban[];
  viewerId: string;
  viewerIsOwner: boolean;
  viewerIsStaff: boolean;
  canTransfer: boolean;
}) {
  const confirm = useConfirmDialog();
  const { busy, error, run } = useAction();
  const [q, setQ] = useState("");
  const shown = members.filter((m) => !q || m.handle.includes(q.toLowerCase().replace(/^@/, "")) || m.displayName.toLowerCase().includes(q.toLowerCase()));
  const outranks = (m: Member) => m.userId !== viewerId && m.role !== "OWNER" && (viewerIsOwner || viewerIsStaff || m.role === "MEMBER");

  async function remove(m: Member, ban: boolean) {
    const ok = await confirm({
      title: ban ? `Ban ${m.displayName}?` : `Remove ${m.displayName}?`,
      message: ban ? "They're removed and can't rejoin — not even with an invite — until you unban them." : "They can rejoin later if the community is open.",
      confirmLabel: ban ? "Ban" : "Remove",
    });
    if (ok) run(`rm-${m.userId}`, `/api/communities/${communityId}/members/${m.userId}`, "DELETE", { ban });
  }

  return (
    <div className="flex flex-col gap-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members" className="field-input h-11" aria-label="Search members" />
      <ul className="flex flex-col divide-y divide-border rounded-[14px] border border-border bg-surface">
        {shown.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={m.displayName} url={m.avatarUrl} />
            <Link href={`/players/${m.handle}`} className="flex min-w-0 flex-1 flex-col hover:underline">
              <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
                {m.displayName}
                {m.role === "OWNER" && <Crown size={13} className="text-accent-volt" aria-label="Owner" />}
                {m.role === "MODERATOR" && <Shield size={13} className="text-muted" aria-label="Moderator" />}
              </span>
              <span className="truncate text-xs text-muted">
                @{m.handle}
                {m.mutedUntil &&
                  ` · muted until ${new Date(m.mutedUntil).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}`}
              </span>
            </Link>
            {outranks(m) && (
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {(viewerIsOwner || viewerIsStaff) && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(`role-${m.userId}`, `/api/communities/${communityId}/members/${m.userId}`, "PATCH", { role: m.role === "MODERATOR" ? "MEMBER" : "MODERATOR" })}
                    className="btn-secondary h-8 px-2.5 text-xs"
                  >
                    {m.role === "MODERATOR" ? "Remove mod" : "Make mod"}
                  </button>
                )}
                {canTransfer && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      if (await confirm({ title: `Make ${m.displayName} the owner?`, message: "You'll become a moderator. Only they can undo this.", confirmLabel: "Transfer ownership" })) {
                        run(`own-${m.userId}`, `/api/communities/${communityId}/members/${m.userId}`, "PATCH", { transferOwnership: true });
                      }
                    }}
                    className="btn-secondary hidden h-8 px-2.5 text-xs sm:inline-flex"
                  >
                    Make owner
                  </button>
                )}
                {m.mutedUntil ? (
                  <button type="button" disabled={busy !== null} onClick={() => run(`unmute-${m.userId}`, `/api/communities/${communityId}/members/${m.userId}`, "PATCH", { unmute: true })} className="btn-secondary h-8 px-2.5 text-xs">
                    Unmute
                  </button>
                ) : (
                  <select
                    aria-label={`Mute ${m.displayName}`}
                    disabled={busy !== null}
                    value=""
                    onChange={(e) => e.target.value && run(`mute-${m.userId}`, `/api/communities/${communityId}/members/${m.userId}`, "PATCH", { muteHours: Number(e.target.value) })}
                    className="field-select h-8 w-auto rounded-[8px] py-0 pr-7 pl-2.5 text-xs"
                  >
                    <option value="">Mute…</option>
                    <option value="1">1 hour</option>
                    <option value="24">24 hours</option>
                    <option value="168">7 days</option>
                  </select>
                )}
                <button type="button" disabled={busy !== null} onClick={() => remove(m, false)} className="btn-secondary h-8 px-2.5 text-xs">
                  Remove
                </button>
                <button type="button" disabled={busy !== null} onClick={() => remove(m, true)} className="btn-secondary h-8 px-2.5 text-xs text-danger">
                  Ban
                </button>
              </div>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No members match.</li>}
      </ul>
      {error && <p className="field-error">{error}</p>}

      {bans.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-eyebrow">Banned</h3>
          <ul className="flex flex-col divide-y divide-border rounded-[14px] border border-border bg-surface">
            {bans.map((b) => (
              <li key={b.userId} className="flex items-center gap-3 px-3 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{b.displayName}</span>
                  <span className="truncate text-xs text-muted">@{b.handle}{b.reason ? ` · ${b.reason}` : ""}</span>
                </span>
                <button type="button" disabled={busy !== null} onClick={() => run(`unban-${b.userId}`, `/api/communities/${communityId}/bans/${b.userId}`, "DELETE")} className="btn-secondary h-8 px-3 text-xs">
                  Unban
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Invite = { id: string; code: string; uses: number; maxUses: number | null; expiresAt: string | null; createdBy: string };

export function InviteManager({ communityId, communityName, invites, origin }: { communityId: string; communityName: string; invites: Invite[]; origin: string }) {
  const { busy, error, run } = useAction();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setCreating(true)} className="btn-primary h-11 w-fit gap-1.5 px-5">
        <Plus size={15} /> New invite link
      </button>
      {invites.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">No active invite links.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-[14px] border border-border bg-surface">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-sm">/invite/{inv.code}</span>
                <span className="text-xs text-muted">
                  {inv.uses}
                  {inv.maxUses ? `/${inv.maxUses}` : ""} used ·{" "}
                  {inv.expiresAt ? `expires ${new Date(inv.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" })}` : "never expires"} · by @{inv.createdBy}
                </span>
              </span>
              <button
                type="button"
                className={rowBtn}
                onClick={async () => {
                  await navigator.clipboard.writeText(`${origin}/invite/${inv.code}`);
                  setCopied(inv.id);
                  setTimeout(() => setCopied(null), 1500);
                }}
                aria-label="Copy link"
              >
                {copied === inv.id ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button type="button" className={`${rowBtn} hover:text-danger`} disabled={busy !== null} onClick={() => run(`rev-${inv.id}`, `/api/communities/${communityId}/invites/${inv.id}`, "DELETE")} aria-label="Revoke">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="field-error">{error}</p>}
      <InviteDialog
        open={creating}
        onClose={() => {
          setCreating(false);
          router.refresh();
        }}
        communityId={communityId}
        communityName={communityName}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

type Application = { id: string; answer: string; createdAt: string; user: { handle: string; displayName: string; avatarUrl: string | null } };

export function ApplicationQueue({ communityId, applications, question }: { communityId: string; applications: Application[]; question: string | null }) {
  const { busy, error, run } = useAction();
  if (applications.length === 0) {
    return <p className="rounded-[14px] border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">No applications waiting.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {applications.map((a) => (
        <div key={a.id} className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <Avatar name={a.user.displayName} url={a.user.avatarUrl} />
            <Link href={`/players/${a.user.handle}`} className="flex min-w-0 flex-1 flex-col hover:underline">
              <span className="truncate text-sm font-semibold">{a.user.displayName}</span>
              <span className="truncate text-xs text-muted">@{a.user.handle}</span>
            </Link>
          </div>
          {a.answer && (
            <div className="rounded-[10px] bg-surface-elevated/50 px-3 py-2 text-sm">
              {question && <p className="mb-1 text-xs text-muted">{question}</p>}
              {a.answer}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy !== null} onClick={() => run(`ok-${a.id}`, `/api/communities/${communityId}/applications/${a.id}`, "PATCH", { approve: true })} className="btn-primary h-9 px-4 text-sm">
              Approve
            </button>
            <button type="button" disabled={busy !== null} onClick={() => run(`no-${a.id}`, `/api/communities/${communityId}/applications/${a.id}`, "PATCH", { approve: false })} className="btn-secondary h-9 px-4 text-sm">
              Decline
            </button>
          </div>
        </div>
      ))}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function CloseCommunity({ communityId, name }: { communityId: string; name: string }) {
  const confirm = useConfirmDialog();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-danger/30 p-4">
      <div>
        <h3 className="text-sm font-semibold">Close community</h3>
        <p className="text-[13px] text-muted">Everyone loses access and it disappears from discovery. This can&apos;t be undone from here.</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          if (!(await confirm({ title: `Close ${name}?`, message: "Members lose access to every channel.", confirmLabel: "Close community" }))) return;
          const err = await call(`/api/communities/${communityId}`, "DELETE");
          if (err) setError(err);
          else router.replace("/communities");
        }}
        className="btn-secondary h-10 w-fit px-4 text-sm text-danger"
      >
        Close community
      </button>
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------

export type ReportRow = {
  id: string;
  status: "OPEN" | "ESCALATED";
  targetType: "MESSAGE" | "MEMBER" | "COMMUNITY" | "THREAD";
  reason: string;
  details: string | null;
  messageContent: string | null;
  messageRemoved: boolean;
  channelName: string | null;
  createdAt: string;
  reporter: { handle: string; displayName: string };
  targetUser: { handle: string; displayName: string } | null;
};

const REASON_LABEL: Record<string, string> = {
  HARASSMENT: "Harassment",
  HATE: "Hate or abuse",
  SPAM: "Spam",
  SCAM: "Scam",
  SEXUAL: "Sexual content",
  CHEATING: "Cheating",
  THREATS: "Threats",
  IMPERSONATION: "Impersonation",
  OTHER: "Other",
};

/** Moderators' report queue. Staff can use it too (`staff`), which adds suspending the community. */
export function ReportQueue({ reports, staff = false, communityLinks = false }: { reports: (ReportRow & { community?: { name: string; href: string } })[]; staff?: boolean; communityLinks?: boolean }) {
  const { busy, error, run } = useAction();
  if (reports.length === 0) {
    return <p className="rounded-[14px] border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">Nothing reported. 🎉</p>;
  }
  const act = (id: string, action: string) => run(`${action}-${id}`, `/api/communities/reports/${id}`, "PATCH", { action });
  return (
    <div className="flex flex-col gap-3">
      {reports.map((r) => {
        const canAct = staff || r.status === "OPEN";
        return (
          <div key={r.id} className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-attention">{REASON_LABEL[r.reason] ?? r.reason}</span>
              <span className="text-xs text-muted">
                {r.targetType === "MESSAGE" ? `Message${r.channelName ? ` in #${r.channelName}` : ""}` : r.targetType === "MEMBER" ? "Member" : r.targetType === "COMMUNITY" ? "Whole community" : "Thread"}
                {r.targetUser && (
                  <>
                    {" "}by{" "}
                    <Link href={`/players/${r.targetUser.handle}`} className="font-medium text-foreground hover:underline">
                      @{r.targetUser.handle}
                    </Link>
                  </>
                )}
              </span>
              {communityLinks && r.community && (
                <Link href={r.community.href} className="text-xs font-medium text-accent-blue hover:underline">
                  {r.community.name}
                </Link>
              )}
              {r.status === "ESCALATED" && !staff && <span className="badge badge-neutral ml-auto">With Circuit staff</span>}
            </div>
            {r.messageContent && (
              <blockquote className={`rounded-[10px] border-l-2 border-border-strong bg-surface-elevated/50 px-3 py-2 text-sm ${r.messageRemoved ? "text-muted line-through" : ""}`}>
                {r.messageContent}
              </blockquote>
            )}
            {r.details && <p className="text-sm">“{r.details}”</p>}
            <p className="text-xs text-muted">
              Reported by @{r.reporter.handle} · {new Date(r.createdAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}
            </p>
            {canAct && (
              <div className="flex flex-wrap gap-2">
                {r.targetType === "MESSAGE" && !r.messageRemoved && (
                  <button type="button" disabled={busy !== null} onClick={() => act(r.id, "remove_message")} className="btn-secondary h-9 px-3 text-sm">
                    Remove message
                  </button>
                )}
                {r.targetUser && (
                  <>
                    <button type="button" disabled={busy !== null} onClick={() => act(r.id, "mute_24h")} className="btn-secondary h-9 px-3 text-sm">
                      Mute 24h
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => act(r.id, "ban")} className="btn-secondary h-9 px-3 text-sm text-danger">
                      Ban
                    </button>
                  </>
                )}
                {staff && (
                  <button type="button" disabled={busy !== null} onClick={() => act(r.id, "suspend_community")} className="btn-secondary h-9 px-3 text-sm text-danger">
                    Suspend community
                  </button>
                )}
                {!staff && (
                  <button type="button" disabled={busy !== null} onClick={() => act(r.id, "escalate")} className="btn-secondary h-9 px-3 text-sm">
                    Send to Circuit staff
                  </button>
                )}
                <button type="button" disabled={busy !== null} onClick={() => act(r.id, "dismiss")} className="btn-ghost h-9 px-3 text-sm">
                  Dismiss
                </button>
              </div>
            )}
          </div>
        );
      })}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
