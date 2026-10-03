"use client";

/**
 * Circuit Community — the side panel next to the chat (a full-screen sheet
 * on phones): a thread, the member list with who's online, the channel's
 * pinned messages, and message search.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crown, Flag, Lock, LockOpen, MessagesSquare, Pin, Search, Shield, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { ChatComposer, type ComposerSubmit } from "./ChatComposer";
import { Avatar, formatTime, MessageList, useMessageStream, type MessageInfo } from "./chatShared";
import { ReportDialog } from "./ReportDialog";

function PanelShell({ title, icon, onClose, actions, children }: { title: React.ReactNode; icon: React.ReactNode; onClose: () => void; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <span className="shrink-0 text-muted">{icon}</span>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</div>
        {actions}
        <button type="button" onClick={onClose} aria-label="Close panel" className="btn-icon">
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

type ThreadInfo = {
  id: string;
  title: string;
  locked: boolean;
  channelId: string;
  channelName: string;
  communityId: string;
  isMod: boolean;
  canPost: boolean;
  starter: { content: string; kind: string; createdAt: string; author: { displayName: string; handle: string } } | null;
};

export function ThreadPanel({
  threadId,
  communityId,
  viewerId,
  roleBadges,
  muted,
  onClose,
}: {
  threadId: string;
  communityId: string;
  viewerId: string;
  roleBadges: Record<string, "OWNER" | "MODERATOR">;
  muted: boolean;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<ThreadInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageInfo | null>(null);
  const [reporting, setReporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/threads/${threadId}`)
      .then(async (res) => (res.ok ? ((await res.json()) as ThreadInfo) : null))
      .then((data) => {
        if (cancelled) return;
        if (data) setInfo(data);
        else setError("This thread isn't available.");
      })
      .catch(() => !cancelled && setError("Couldn't load the thread."));
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const stream = useMessageStream({ channelId: info?.channelId ?? "", threadId, enabled: !!info, onError: setError });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [stream.messages?.length]);

  async function toggleLock() {
    if (!info) return;
    const res = await fetch(`/api/threads/${threadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locked: !info.locked }) }).catch(() => null);
    if (res?.ok) setInfo({ ...info, locked: !info.locked, canPost: info.isMod || info.locked });
  }

  async function send(message: ComposerSubmit) {
    setSending(true);
    setError(null);
    const sent = await stream.send(message, replyingTo?.id);
    setSending(false);
    if (sent) setReplyingTo(null);
    return !!sent;
  }

  return (
    <PanelShell
      icon={<MessagesSquare size={16} />}
      title={
        info ? (
          <span className="flex items-center gap-1.5">
            <span className="truncate">{info.title}</span>
            {info.locked && <Lock size={12} className="shrink-0 text-muted" />}
          </span>
        ) : (
          "Thread"
        )
      }
      onClose={onClose}
      actions={
        info && (
          <>
            {info.isMod && (
              <button type="button" onClick={toggleLock} aria-label={info.locked ? "Unlock thread" : "Lock thread"} title={info.locked ? "Unlock thread" : "Lock thread"} className="btn-icon">
                {info.locked ? <LockOpen size={15} /> : <Lock size={15} />}
              </button>
            )}
            {!info.isMod && (
              <button type="button" onClick={() => setReporting(true)} aria-label="Report thread" title="Report thread" className="btn-icon">
                <Flag size={15} />
              </button>
            )}
          </>
        )
      }
    >
      <div ref={scrollRef} className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-6">
        {info?.starter && (
          <div className="rounded-[12px] border border-border bg-surface-elevated/40 px-3 py-2.5 text-sm">
            <p className="mb-0.5 text-xs text-muted">
              Started from <span className="font-semibold text-foreground">{info.starter.author.displayName}</span> · {formatTime(info.starter.createdAt)} in #{info.channelName}
            </p>
            <p className="line-clamp-4 whitespace-pre-line">{info.starter.content || "📷 Image"}</p>
          </div>
        )}
        {!info && !error && (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={20} className="text-muted" />
          </div>
        )}
        {stream.loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={20} className="text-muted" />
          </div>
        ) : stream.messages && stream.messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No replies yet. Start the conversation.</p>
        ) : (
          stream.messages && (
            <MessageList
              messages={stream.messages}
              viewerId={viewerId}
              isModerator={!!info?.isMod}
              roleBadges={roleBadges}
              flashId={null}
              handlers={{ onReact: stream.react, onDelete: stream.remove, onReply: setReplyingTo }}
            />
          )
        )}
      </div>
      {error && <p className="field-error shrink-0 px-4 pb-1">{error}</p>}
      <div className="shrink-0 border-t border-border">
        {info && (muted || !info.canPost) ? (
          <p className="flex items-center justify-center gap-1.5 px-4 py-4 text-center text-sm text-muted">
            <Lock size={14} /> {muted ? "You're muted in this community." : "This thread is locked."}
          </p>
        ) : (
          info && (
            <ChatComposer
              communityId={communityId}
              channelName={info.channelName}
              placeholder="Reply in thread"
              sending={sending}
              onSubmit={send}
              onError={setError}
              replyingTo={replyingTo ? { authorName: replyingTo.author.displayName, snippet: replyingTo.content.slice(0, 80) } : null}
              onCancelReply={() => setReplyingTo(null)}
            />
          )
        )}
      </div>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} target={{ targetType: "THREAD", threadId }} title="Report this thread" />
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

type PresenceMember = { id: string; handle: string; displayName: string; avatarUrl: string | null; role: "OWNER" | "MODERATOR" | "MEMBER"; online: boolean; lastActiveAt: string | null };

function lastSeen(iso: string | null): string {
  if (!iso) return "Not seen yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `Active ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  return `Active ${Math.round(hours / 24)}d ago`;
}

export function MembersPanel({ communityId, onClose }: { communityId: string; onClose: () => void }) {
  const [data, setData] = useState<{ members: PresenceMember[]; total: number; online: number } | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/communities/${communityId}/members`)
        .then(async (res) => (res.ok ? res.json() : null))
        .then((d) => !cancelled && d && setData(d))
        .catch(() => undefined);
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [communityId]);

  const shown = data?.members.filter((m) => !q || m.displayName.toLowerCase().includes(q.toLowerCase()) || m.handle.includes(q.toLowerCase().replace(/^@/, ""))) ?? [];
  const online = shown.filter((m) => m.online);
  const offline = shown.filter((m) => !m.online);

  const row = (m: PresenceMember) => (
    <li key={m.id}>
      <Link href={`/players/${m.handle}`} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 transition hover:bg-surface-elevated">
        <Avatar author={m} online={m.online} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {m.displayName}
            {m.role === "OWNER" && <Crown size={12} className="shrink-0 text-accent-volt" aria-label="Owner" />}
            {m.role === "MODERATOR" && <Shield size={12} className="shrink-0 text-muted" aria-label="Moderator" />}
          </span>
          <span className="truncate text-xs text-muted">{m.online ? "Online" : lastSeen(m.lastActiveAt)}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <PanelShell icon={<Shield size={16} />} title={data ? `Members · ${data.total}` : "Members"} onClose={onClose}>
      <div className="shrink-0 px-4 pt-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a member" className="field-input h-10" aria-label="Find a member" />
      </div>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-6">
        {!data ? (
          <div className="flex justify-center py-8">
            <Spinner size={20} className="text-muted" />
          </div>
        ) : (
          <>
            <p className="text-eyebrow px-2 pt-2 pb-1">Online · {online.length}</p>
            <ul className="flex flex-col">{online.map(row)}</ul>
            {offline.length > 0 && (
              <>
                <p className="text-eyebrow px-2 pt-4 pb-1">Offline · {offline.length}</p>
                <ul className="flex flex-col opacity-80">{offline.map(row)}</ul>
              </>
            )}
            {data.total > data.members.length && <p className="px-2 pt-3 text-xs text-muted">Showing the {data.members.length} most recently active.</p>}
          </>
        )}
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

type PinRow = { id: string; content: string; kind: string; createdAt: string; threadId: string | null; author: { displayName: string; handle: string; avatarUrl: string | null } };

export function PinsPanel({ channelId, channelName, onJump, onClose }: { channelId: string; channelName: string; onJump: (messageId: string) => void; onClose: () => void }) {
  const [pins, setPins] = useState<{ channelId: string; rows: PinRow[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/channels/${channelId}/pins`)
      .then(async (res) => (res.ok ? ((await res.json()) as { pins: PinRow[] }).pins : []))
      .then((rows) => !cancelled && setPins({ channelId, rows }))
      .catch(() => !cancelled && setPins({ channelId, rows: [] }));
    return () => {
      cancelled = true;
    };
  }, [channelId]);
  const rows = pins?.channelId === channelId ? pins.rows : null;

  return (
    <PanelShell icon={<Pin size={16} />} title={`Pinned in #${channelName}`} onClose={onClose}>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!rows ? (
          <div className="flex justify-center py-8">
            <Spinner size={20} className="text-muted" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">Nothing pinned yet. Moderators can pin important messages here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onJump(p.id)} className="flex w-full items-start gap-2.5 rounded-[12px] border border-border bg-surface p-3 text-left transition hover:border-border-hover">
                  <Avatar author={p.author} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-xs text-muted">
                      <span className="font-semibold text-foreground">{p.author.displayName}</span> · {new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" })}
                    </span>
                    <span className="line-clamp-3 text-sm whitespace-pre-line">{p.content || (p.kind === "IMAGE" ? "📷 Image" : "Sticker")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------

type SearchResult = {
  id: string;
  content: string;
  createdAt: string;
  threadId: string | null;
  thread: { title: string } | null;
  channel: { id: string; key: string; name: string };
  author: { displayName: string; handle: string; avatarUrl: string | null };
};

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return text;
  const start = Math.max(0, i - 40);
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, i)}
      <mark className="rounded-[3px] bg-accent-volt/40 text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length, i + q.length + 120)}
    </>
  );
}

export function SearchPanel({
  communityId,
  onOpen,
  onClose,
}: {
  communityId: string;
  onOpen: (result: { messageId: string; channelId: string; threadId: string | null }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; rows: SearchResult[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/communities/${communityId}/search?q=${encodeURIComponent(term)}`)
        .then(async (res) => (res.ok ? ((await res.json()) as { results: SearchResult[] }).results : []))
        .then((rows) => !cancelled && setResults({ q: term, rows }))
        .catch(() => undefined);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, communityId]);

  const term = q.trim();
  const rows = results && results.q === term ? results.rows : null;

  return (
    <PanelShell icon={<Search size={16} />} title="Search messages" onClose={onClose}>
      <div className="shrink-0 px-4 pt-3">
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this community" className="field-input h-10" aria-label="Search messages" />
      </div>
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {term.length < 2 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">Type at least 2 characters.</p>
        ) : !rows ? (
          <div className="flex justify-center py-8">
            <Spinner size={20} className="text-muted" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted">No messages match “{term}”.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen({ messageId: r.id, channelId: r.channel.id, threadId: r.threadId })}
                  className="flex w-full flex-col gap-1 rounded-[12px] border border-border bg-surface p-3 text-left transition hover:border-border-hover"
                >
                  <span className="text-xs text-muted">
                    <span className="font-semibold text-foreground">{r.author.displayName}</span> · #{r.channel.name}
                    {r.thread && ` › ${r.thread.title}`} · {new Date(r.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" })}
                  </span>
                  <span className="line-clamp-3 text-sm">{highlight(r.content, term)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}
