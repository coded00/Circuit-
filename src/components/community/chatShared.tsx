"use client";

/**
 * Circuit Community — what the channel view and the thread panel share:
 * message types, rendering helpers, the message list itself, and
 * useMessageStream (load → poll → send/react/remove for one channel or
 * thread).
 *
 * No WebSocket (see Poller.tsx and the schema comment): each stream polls
 * for messages newer than its last one, plus changes to older ones
 * (reactions, removals, pins, thread counts) since the previous poll's
 * server time.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ComposerSubmit } from "./ChatComposer";
import type { MessageContent } from "./MessageBody";
import { MessageRow } from "./MessageRow";
import type { ReactionSummary } from "@/lib/communityReactions";

export type Author = { id: string; displayName: string; handle: string; avatarUrl: string | null; tag?: string | null; tagHref?: string | null };
export type ThreadSummary = { id: string; title: string; messageCount: number; lastMessageAt: string; locked: boolean };
export type ReplyQuote = { id: string; authorName: string; snippet: string; removed: boolean };
export type MessageInfo = MessageContent & {
  id: string;
  createdAt: string;
  isSystem: boolean;
  author: Author;
  reactions: ReactionSummary[];
  replyTo?: ReplyQuote | null;
  pinned?: boolean;
  thread?: ThreadSummary | null;
};
export type MessageUpdate = { messageId: string; reactions: ReactionSummary[]; deleted?: boolean; pinned?: boolean; thread?: ThreadSummary | null };

export const POLL_INTERVAL_MS = 4000;
/** Consecutive messages from the same author within this window render
 *  grouped (no repeated avatar/name), like Discord/Slack. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// Pinned so server render and browser agree (and match Circuit's locale).
export const LOCAL_TIME_ZONE = "Africa/Lagos";

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: LOCAL_TIME_ZONE });
}

function dayKeyIn(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: LOCAL_TIME_ZONE }); // YYYY-MM-DD
}

function formatDayDivider(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKeyIn(date) === dayKeyIn(today)) return "Today";
  if (dayKeyIn(date) === dayKeyIn(yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: LOCAL_TIME_ZONE });
}

type MessageGroup = { author: Author; dayLabel: string | null; messages: MessageInfo[] };

/** Day dividers + same-author clusters. A reply always starts a new group
 *  (its quote needs the name above it to read naturally). */
function groupMessages(messages: MessageInfo[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let lastDayKey: string | null = null;
  for (const message of messages) {
    const dayKey = dayKeyIn(new Date(message.createdAt));
    const isNewDay = dayKey !== lastDayKey;
    lastDayKey = dayKey;
    const lastGroup = groups[groups.length - 1];
    const lastMessage = lastGroup?.messages[lastGroup.messages.length - 1];
    const withinWindow = lastMessage && new Date(message.createdAt).getTime() - new Date(lastMessage.createdAt).getTime() < GROUP_WINDOW_MS;
    if (!isNewDay && lastGroup && lastGroup.author.id === message.author.id && withinWindow && !message.replyTo && !message.isSystem) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ author: message.author, dayLabel: isNewDay ? formatDayDivider(message.createdAt) : null, messages: [message] });
    }
  }
  return groups;
}

/** Appends new messages, skipping ids already present (a send's response
 *  and the next poll can both deliver the same row). */
export function mergeMessages(existing: MessageInfo[], incoming: MessageInfo[]): MessageInfo[] {
  const seen = new Set(existing.map((m) => m.id));
  const deduped = incoming.filter((m) => !seen.has(m.id));
  return deduped.length > 0 ? [...existing, ...deduped] : existing;
}

export function applyUpdates(messages: MessageInfo[], updates: MessageUpdate[]): MessageInfo[] {
  if (updates.length === 0) return messages;
  const removed = new Set(updates.filter((u) => u.deleted).map((u) => u.messageId));
  const byId = new Map(updates.map((u) => [u.messageId, u]));
  return messages
    .filter((m) => !removed.has(m.id))
    .map((m) => {
      const u = byId.get(m.id);
      if (!u) return m;
      return { ...m, reactions: u.reactions, ...(u.pinned !== undefined ? { pinned: u.pinned } : {}), ...(u.thread !== undefined ? { thread: u.thread } : {}) };
    });
}

/** The viewer's own reaction toggle, applied before the server answers. */
function toggleLocally(reactions: ReactionSummary[], emoji: string, on: boolean): ReactionSummary[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (on) {
    if (existing?.reacted) return reactions;
    if (existing) return reactions.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true, names: [...r.names, "You"] } : r));
    return [...reactions, { emoji, count: 1, reacted: true, names: ["You"] }];
  }
  if (!existing?.reacted) return reactions;
  return reactions
    .map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false, names: r.names.filter((n) => n !== "You") } : r))
    .filter((r) => r.count > 0);
}

export function Avatar({ author, online }: { author: Pick<Author, "displayName" | "avatarUrl">; online?: boolean }) {
  return (
    <span className="relative shrink-0">
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
        <img src={author.avatarUrl} alt="" className="h-8 w-8 cut-avatar object-cover" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center cut-avatar border border-border bg-surface-elevated text-xs font-semibold text-muted">
          {author.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface ${online ? "bg-success" : "bg-muted-strong"}`}
          aria-label={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------

type StreamOptions = {
  channelId: string;
  threadId?: string | null;
  enabled: boolean;
  /** Messages already rendered by the server for the first key. */
  initialMessages?: MessageInfo[];
  initialServerTime?: string;
  onError: (message: string) => void;
};

async function readError(res: Response | null, fallback: string) {
  return ((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;
}

/**
 * One live message stream (a channel's main feed, or one thread). Switching
 * `channelId`/`threadId` shows a loading state and fetches the new stream;
 * everything is keyed so a late response for an old stream is ignored.
 */
export function useMessageStream({ channelId, threadId = null, enabled, initialMessages, initialServerTime, onError }: StreamOptions) {
  const key = `${channelId}:${threadId ?? ""}`;
  const [state, setState] = useState<{ key: string; messages: MessageInfo[] | null }>(() => ({
    key,
    messages: initialMessages ?? null,
  }));
  const messages = state.key === key ? state.messages : null;
  const reactionsSince = useRef<Record<string, string>>(initialServerTime ? { [key]: initialServerTime } : {});
  const current = useRef<{ key: string; messages: MessageInfo[] | null }>(state);
  useEffect(() => {
    current.current = state;
  }, [state]);
  const [reloadToken, setReloadToken] = useState(0);
  const aroundRef = useRef<string | null>(null);

  const base = `/api/channels/${channelId}/messages`;
  const threadParam = threadId ? `thread=${encodeURIComponent(threadId)}` : "";

  // Load (or reload around a message) whenever the stream has nothing yet.
  useEffect(() => {
    if (!enabled || !channelId || messages !== null) return;
    let cancelled = false;
    const requestedAt = new Date().toISOString();
    const around = aroundRef.current;
    const qs = [threadParam, around ? `around=${encodeURIComponent(around)}` : ""].filter(Boolean).join("&");
    fetch(qs ? `${base}?${qs}` : base)
      .then(async (res) => (res.ok ? ((await res.json()) as { messages: MessageInfo[] }).messages : []))
      .catch(() => [] as MessageInfo[])
      .then((loaded) => {
        if (cancelled) return;
        aroundRef.current = null;
        reactionsSince.current[key] ??= requestedAt;
        setState({ key, messages: loaded });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `messages` null-ness and reloadToken drive loading
  }, [key, enabled, messages === null, reloadToken]);

  // Poll for anything newer, plus changes to what's on screen.
  useEffect(() => {
    if (!enabled || !channelId) return;
    const interval = setInterval(async () => {
      try {
        const snapshot = current.current;
        if (snapshot.key !== key || !snapshot.messages) return;
        const list = snapshot.messages;
        const since = list.length > 0 ? list[list.length - 1].createdAt : new Date(0).toISOString();
        const rs = reactionsSince.current[key];
        const qs = [threadParam, `since=${encodeURIComponent(since)}`, rs ? `reactionsSince=${encodeURIComponent(rs)}` : ""].filter(Boolean).join("&");
        const res = await fetch(`${base}?${qs}`);
        if (!res.ok) return;
        const data: { messages: MessageInfo[]; reactionUpdates: MessageUpdate[]; serverTime: string } = await res.json();
        reactionsSince.current[key] = data.serverTime;
        if (data.messages.length > 0 || data.reactionUpdates.length > 0) {
          setState((prev) => (prev.key === key && prev.messages ? { key, messages: applyUpdates(mergeMessages(prev.messages, data.messages), data.reactionUpdates) } : prev));
        }
      } catch {
        // A network blip — the next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [key, enabled, base, threadParam, channelId]);

  const update = useCallback(
    (fn: (list: MessageInfo[]) => MessageInfo[]) => setState((prev) => (prev.key === key && prev.messages ? { key, messages: fn(prev.messages) } : prev)),
    [key]
  );

  async function send(message: ComposerSubmit, replyToId?: string | null): Promise<MessageInfo | null> {
    let res: Response | null;
    try {
      if (message.kind === "IMAGE") {
        const form = new FormData();
        form.append("image", message.image.blob);
        form.append("caption", message.caption);
        form.append("width", String(message.image.width));
        form.append("height", String(message.image.height));
        if (threadId) form.append("threadId", threadId);
        if (replyToId) form.append("replyToId", replyToId);
        res = await fetch(base, { method: "POST", body: form });
      } else {
        res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(message.kind === "STICKER" ? { stickerId: message.stickerId } : { content: message.content }),
            threadId,
            replyToId: replyToId ?? null,
          }),
        });
      }
    } catch {
      onError("Message didn't send. Check your connection and try again.");
      return null;
    }
    if (!res.ok) {
      onError(await readError(res, "Message didn't send. Try again."));
      return null;
    }
    const sent = (await res.json()) as MessageInfo;
    update((list) => mergeMessages(list, [sent]));
    return sent;
  }

  async function react(messageId: string, emoji: string, on: boolean) {
    const before = current.current.messages?.find((m) => m.id === messageId)?.reactions ?? [];
    update((list) => list.map((m) => (m.id === messageId ? { ...m, reactions: toggleLocally(m.reactions, emoji, on) } : m)));
    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji, on }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Couldn't update your reaction.");
      update((list) => list.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m)));
    } catch (err) {
      update((list) => list.map((m) => (m.id === messageId ? { ...m, reactions: before } : m)));
      onError(err instanceof Error ? err.message : "Couldn't update your reaction.");
    }
  }

  async function remove(messageId: string) {
    const res = await fetch(`/api/messages/${messageId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return onError(await readError(res, "Couldn't remove that message."));
    update((list) => list.filter((m) => m.id !== messageId));
  }

  async function togglePin(messageId: string, pinned: boolean) {
    const res = await fetch(`/api/messages/${messageId}/pin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned }) }).catch(() => null);
    if (!res?.ok) return onError(await readError(res, "Couldn't update the pin."));
    update((list) => list.map((m) => (m.id === messageId ? { ...m, pinned } : m)));
  }

  /** Re-open the stream around an older message (search/pins). */
  function loadAround(messageId: string) {
    aroundRef.current = messageId;
    setState({ key, messages: null });
    setReloadToken((t) => t + 1);
  }

  return { messages, loading: enabled && messages === null, send, react, remove, togglePin, loadAround, update };
}

// ---------------------------------------------------------------------------

const ROLE_BADGE: Record<"OWNER" | "MODERATOR", string> = { OWNER: "Owner", MODERATOR: "Mod" };

export type MessageListHandlers = {
  onReact: (messageId: string, emoji: string, on: boolean) => void;
  onDelete: (messageId: string) => void;
  onReply?: (message: MessageInfo) => void;
  onStartThread?: (message: MessageInfo) => void;
  onTogglePin?: (message: MessageInfo) => void;
  onOpenThread?: (threadId: string) => void;
  onJumpTo?: (messageId: string) => void;
};

export function MessageList({
  messages,
  viewerId,
  isModerator,
  roleBadges = {},
  flashId,
  handlers,
}: {
  messages: MessageInfo[];
  viewerId: string;
  isModerator: boolean;
  roleBadges?: Record<string, "OWNER" | "MODERATOR">;
  flashId: string | null;
  handlers: MessageListHandlers;
}) {
  return (
    <>
      {groupMessages(messages).map((group) => (
        <div key={group.messages[0].id} className="flex flex-col gap-1.5">
          {group.dayLabel && (
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-metadata shrink-0">{group.dayLabel}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          {group.messages.map((message, i) => (
            <MessageRow
              key={message.id}
              message={message}
              viewerId={viewerId}
              highlighted={flashId === message.id}
              onReact={handlers.onReact}
              onDelete={message.author.id === viewerId || isModerator ? handlers.onDelete : undefined}
              canReport={message.author.id !== viewerId && !message.isSystem}
              onReply={handlers.onReply && !message.isSystem ? () => handlers.onReply!(message) : undefined}
              onStartThread={handlers.onStartThread && !message.thread && !message.isSystem ? () => handlers.onStartThread!(message) : undefined}
              onTogglePin={isModerator && handlers.onTogglePin ? () => handlers.onTogglePin!(message) : undefined}
              onOpenThread={handlers.onOpenThread}
              onJumpTo={handlers.onJumpTo}
              leading={i === 0 ? <Avatar author={group.author} /> : <span className="w-8 shrink-0" aria-hidden />}
              header={
                i === 0 ? (
                  <div className="flex items-baseline gap-2">
                    <Link href={`/players/${group.author.handle}`} className="truncate text-sm font-semibold hover:underline">
                      {group.author.displayName}
                    </Link>
                    {group.author.tag && (
                      <Link href={group.author.tagHref ?? "#"} className="shrink-0 rounded-none border border-border px-1 font-mono text-[11px] font-semibold tracking-wide text-muted hover:text-foreground">
                        {group.author.tag}
                      </Link>
                    )}
                    {roleBadges[group.author.id] && (
                      <span className="shrink-0 rounded-none bg-accent-volt/20 px-1 font-mono text-[11px] font-semibold tracking-wide text-foreground uppercase">
                        {ROLE_BADGE[roleBadges[group.author.id]]}
                      </span>
                    )}
                    <span className="text-metadata shrink-0">{formatTime(message.createdAt)}</span>
                  </div>
                ) : undefined
              }
            />
          ))}
        </div>
      ))}
    </>
  );
}
