"use client";

/**
 * Circuit Community — Phase 1's Discord-style chat UI. Channel sidebar
 * (collapses into a slide-over on mobile) + a single message pane.
 *
 * No members column, no reactions, no roles — those are Phase 2. No
 * WebSocket — see `Poller.tsx`'s own doc and this feature's schema
 * comment on why: this component runs its own short interval against
 * the messages API (not the generic `Poller`/`router.refresh()`
 * mechanism, which would blow away this component's own local state on
 * every tick) and only fetches messages newer than the last one it has.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Hash, Menu, Send, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";

type ChannelInfo = { id: string; key: string; name: string };
type Author = { id: string; displayName: string; handle: string; avatarUrl: string | null };
type MessageInfo = { id: string; content: string; createdAt: string; isSystem: boolean; author: Author };

const POLL_INTERVAL_MS = 4000;
/** Consecutive messages from the same author within this window render
 *  grouped (no repeated avatar/name) — same idea as Discord/Slack, using
 *  only data already on the message (author, createdAt), nothing new. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

/** "Today" / "Yesterday" / a real date — for the divider between
 *  messages sent on different days, not a relative "3h ago" (that's
 *  what the per-message time next to the name is already for). */
function formatDayDivider(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

type MessageGroup = { author: Author; dayLabel: string | null; messages: MessageInfo[] };

/** Folds a flat, oldest-first message list into day dividers +
 *  same-author/within-window clusters — purely a rendering concern, the
 *  underlying data/API is unchanged. */
function groupMessages(messages: MessageInfo[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let lastDayKey: string | null = null;

  for (const message of messages) {
    const day = new Date(message.createdAt);
    const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const isNewDay = dayKey !== lastDayKey;
    lastDayKey = dayKey;

    const lastGroup = groups[groups.length - 1];
    const lastMessage = lastGroup?.messages[lastGroup.messages.length - 1];
    const withinWindow =
      lastMessage && new Date(message.createdAt).getTime() - new Date(lastMessage.createdAt).getTime() < GROUP_WINDOW_MS;

    if (!isNewDay && lastGroup && lastGroup.author.id === message.author.id && withinWindow) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ author: message.author, dayLabel: isNewDay ? formatDayDivider(message.createdAt) : null, messages: [message] });
    }
  }
  return groups;
}

/** Appends `incoming` to `existing`, dropping any message whose id is
 *  already present — both the poller and a just-sent message can end up
 *  offering the same row (e.g. a send's own response arriving right as
 *  the next poll also picks it up), and a plain concat would render it
 *  twice with a duplicate React key. */
function mergeMessages(existing: MessageInfo[], incoming: MessageInfo[]): MessageInfo[] {
  const seen = new Set(existing.map((m) => m.id));
  const deduped = incoming.filter((m) => !seen.has(m.id));
  return deduped.length > 0 ? [...existing, ...deduped] : existing;
}

function Avatar({ author }: { author: Author }) {
  return author.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs, same as BracketView's own Avatar
    <img src={author.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
  ) : (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-xs font-semibold text-muted">
      {author.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function CommunityView({
  communityId,
  backHref,
  title,
  channels,
  memberCount,
  initialChannelMessages,
  isMember: initialIsMember,
}: {
  communityId: string;
  /** Where the back arrow goes — the tournament page for a tournament
   *  community, the homepage for Circuit's own platform-wide one. */
  backHref: string;
  /** Header title — the tournament name, or "Circuit" for the
   *  platform-wide community. */
  title: string;
  channels: ChannelInfo[];
  /** Real `CommunityMember` count — not a members list/roles (Phase 2),
   *  just the header's own "X members" line. */
  memberCount: number;
  initialChannelMessages: MessageInfo[];
  isMember: boolean;
}) {
  const [activeChannelId, setActiveChannelId] = useState(channels[0]?.id ?? "");
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, MessageInfo[]>>(() =>
    channels[0] ? { [channels[0].id]: initialChannelMessages } : {}
  );
  const [isMember, setIsMember] = useState(initialIsMember);
  const [joining, setJoining] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const activeMessages = messagesByChannel[activeChannelId] ?? [];
  const channelLoading = activeChannelId !== "" && messagesByChannel[activeChannelId] === undefined;
  const messageGroups = groupMessages(activeMessages);

  // Read inside the poll interval via a ref, not the `messagesByChannel`
  // state directly — keeping it out of that effect's dependency array
  // (see below) means one interval lives for the whole time a channel is
  // active, instead of being torn down and recreated on every single
  // message arrival. That churn was the real cause of a since-seen bug:
  // an in-flight poll from an interval that's already being replaced
  // could still resolve and append its results after the new interval
  // also appended the same message, duplicating it in state.
  const messagesByChannelRef = useRef(messagesByChannel);
  useEffect(() => {
    messagesByChannelRef.current = messagesByChannel;
  }, [messagesByChannel]);

  // Mark the whole community read once, on arrival.
  useEffect(() => {
    fetch(`/api/communities/${communityId}/read`, { method: "POST" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once per mount, not per communityId re-render
  }, []);

  // Load a channel's history the first time it's opened. `channelLoading`
  // above is derived from `messagesByChannel` rather than a separate
  // state flag set here — nothing to set synchronously in the effect
  // body, only the async fetch result once it actually resolves.
  useEffect(() => {
    if (!activeChannelId || messagesByChannel[activeChannelId]) return;
    let cancelled = false;
    fetch(`/api/channels/${activeChannelId}/messages`)
      .then((res) => res.json())
      .then((data: { messages: MessageInfo[] }) => {
        if (!cancelled) setMessagesByChannel((prev) => ({ ...prev, [activeChannelId]: data.messages }));
      });
    return () => {
      cancelled = true;
    };
  }, [activeChannelId, messagesByChannel]);

  // Poll the active channel for anything newer than the last message
  // already shown — not a full refetch, and not the generic Poller
  // (which would re-run this whole page's server component instead).
  // `messagesByChannel` deliberately isn't a dependency — see the ref's
  // own comment above. Merging by id (not a plain append) is a second,
  // independent safety net against the same duplicate-message class of
  // bug, not just a fix for the one race this happened to catch.
  useEffect(() => {
    if (!isMember || !activeChannelId) return;
    const interval = setInterval(async () => {
      const current = messagesByChannelRef.current[activeChannelId] ?? [];
      const since = current.length > 0 ? current[current.length - 1].createdAt : new Date(0).toISOString();
      const res = await fetch(`/api/channels/${activeChannelId}/messages?since=${encodeURIComponent(since)}`);
      if (!res.ok) return;
      const data: { messages: MessageInfo[] } = await res.json();
      if (data.messages.length > 0) {
        setMessagesByChannel((prev) => ({
          ...prev,
          [activeChannelId]: mergeMessages(prev[activeChannelId] ?? [], data.messages),
        }));
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeChannelId, isMember]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeMessages.length]);

  async function handleJoin() {
    setJoining(true);
    setError(null);
    const res = await fetch(`/api/communities/${communityId}/join`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok) setIsMember(true);
    else setError(data?.error ?? "Couldn't join. Try again.");
    setJoining(false);
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending || !activeChannelId) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/channels/${activeChannelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setMessagesByChannel((prev) => ({ ...prev, [activeChannelId]: mergeMessages(prev[activeChannelId] ?? [], [data]) }));
      setDraft("");
    } else {
      setError(data?.error ?? "Message didn't send. Try again.");
    }
    setSending(false);
  }

  return (
    // No fixed viewport-relative height on mobile — AppShell's own <main>
    // already reserves space below for the fixed MobileTabBar (a 100dvh
    // math here would double-count that and push the composer past the
    // visible viewport, reachable only by scrolling the whole page, not
    // just this panel). The message list's own max-h below is what keeps
    // the composer in reach on mobile instead. sm+ has no bottom tab bar
    // to fight with, so the app-like fixed-height panel is safe there.
    <div className="mx-auto flex w-full max-w-6xl flex-col sm:h-[calc(100dvh-96px)] sm:p-6">
      <div className="flex items-center gap-3 border-b border-border p-4 sm:rounded-t-[14px] sm:border sm:border-b-0 sm:bg-surface sm:px-5 sm:py-4">
        <button type="button" onClick={() => setSidebarOpen(true)} className="btn-icon sm:hidden" aria-label="Open channels">
          <Menu size={18} />
        </button>
        <Link href={backHref} className="flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-blue-soft text-accent-blue sm:flex">
          <Hash size={16} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-display text-base font-bold tracking-tight">{title}</span>
          <span className="text-metadata truncate">
            #{activeChannel?.name ?? "community"} · {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 border border-border sm:rounded-b-[14px]">
        {/* Channel sidebar — a normal column at sm+, a slide-over below it.
            `relative` on the parent above is load-bearing: without a
            positioned ancestor, this `absolute inset-0` has nothing to
            anchor to and renders against whatever positioned ancestor is
            further up the tree instead — invisible/mispositioned rather
            than a visible drawer over the message pane. */}
        <div
          className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-0 z-20 flex-col bg-surface sm:relative sm:z-0 sm:flex sm:w-52 sm:shrink-0 sm:border-r sm:border-border sm:bg-surface-elevated/40`}
        >
          <div className="flex items-center justify-between border-b border-border p-3 sm:hidden">
            <span className="text-eyebrow">Channels</span>
            <button type="button" onClick={() => setSidebarOpen(false)} className="btn-icon" aria-label="Close channels">
              <X size={16} />
            </button>
          </div>
          <span className="text-eyebrow hidden px-3 pt-3 pb-1 sm:block">Channels</span>
          <div className="flex flex-col gap-0.5 p-2">
            {channels.map((channel) => {
              const active = channel.id === activeChannelId;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    setActiveChannelId(channel.id);
                    setSidebarOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-[8px] border-l-2 px-2.5 py-1.5 text-left text-sm font-medium transition ${
                    active
                      ? "border-accent-blue bg-surface-elevated text-foreground"
                      : "border-transparent text-muted hover:bg-surface-elevated/60 hover:text-foreground"
                  }`}
                >
                  <Hash size={14} className="shrink-0" />
                  <span className="truncate">{channel.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="scrollbar-hide flex max-h-[55vh] flex-1 flex-col gap-3 overflow-y-auto p-4 sm:max-h-none">
            {channelLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner size={20} className="text-muted" />
              </div>
            ) : activeMessages.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-center text-sm text-muted">
                No messages yet — be the first to say something in #{activeChannel?.name}.
              </p>
            ) : (
              messageGroups.map((group) => (
                <div key={group.messages[0].id} className="flex flex-col gap-3">
                  {group.dayLabel && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-metadata shrink-0">{group.dayLabel}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className="flex items-start gap-2.5">
                    <Avatar author={group.author} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold">{group.author.displayName}</span>
                        <span className="text-metadata shrink-0">{formatTime(group.messages[0].createdAt)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words text-foreground/90">{group.messages[0].content}</p>
                    </div>
                  </div>
                  {/* Same author, within GROUP_WINDOW_MS — no repeated
                      avatar/name, just the text aligned under it. */}
                  {group.messages.slice(1).map((message) => (
                    <div key={message.id} className="flex items-start gap-2.5">
                      <span className="w-8 shrink-0" aria-hidden />
                      <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap break-words text-foreground/90">{message.content}</p>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {error && <p className="field-error px-4 pb-1">{error}</p>}

          <div className="border-t border-border p-3">
            {isMember ? (
              <form onSubmit={handleSend} className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Message #${activeChannel?.name ?? ""}`}
                  maxLength={2000}
                  className="field-input !rounded-full flex-1"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  aria-label="Send message"
                  className="btn-primary !h-10 !w-10 !rounded-full !p-0"
                >
                  <Send size={16} />
                </button>
              </form>
            ) : (
              <button type="button" onClick={handleJoin} disabled={joining} className="btn-primary w-full">
                {joining ? "Joining…" : "Join Community to Chat"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
