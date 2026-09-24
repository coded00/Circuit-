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
import { ArrowLeft, Hash, Menu, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { ChatComposer, type ComposerSubmit } from "@/components/community/ChatComposer";
import { MessageBody, type MessageContent } from "@/components/community/MessageBody";

type ChannelInfo = { id: string; key: string; name: string };
type Author = { id: string; displayName: string; handle: string; avatarUrl: string | null };
type MessageInfo = MessageContent & { id: string; createdAt: string; isSystem: boolean; author: Author };

const POLL_INTERVAL_MS = 4000;
/** Consecutive messages from the same author within this window render
 *  grouped (no repeated avatar/name) — same idea as Discord/Slack, using
 *  only data already on the message (author, createdAt), nothing new. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// V1 audit follow-up: `Intl`'s default timeZone is the *runtime's own*
// local zone — the server (likely UTC) and a visitor's browser almost
// never agree, which both produces a React hydration-mismatch warning
// (this is a "use client" component, so it's still server-rendered for
// the initial HTML) and can show the wrong day/time until the client
// re-renders. Pinning Africa/Lagos explicitly — Circuit's own locale
// throughout ("en-NG" everywhere) — makes server and client compute the
// exact same value regardless of where either actually runs.
const LOCAL_TIME_ZONE = "Africa/Lagos";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: LOCAL_TIME_ZONE });
}

/** The LOCAL_TIME_ZONE calendar date as a stable string key — used both
 *  to decide "Today"/"Yesterday" below and to decide where a day divider
 *  goes in groupMessages, so both agree on the same day boundary
 *  regardless of the runtime's own timezone. */
function dayKeyIn(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: LOCAL_TIME_ZONE }); // en-CA => YYYY-MM-DD
}

/** "Today" / "Yesterday" / a real date — for the divider between
 *  messages sent on different days, not a relative "3h ago" (that's
 *  what the per-message time next to the name is already for). */
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

/** Folds a flat, oldest-first message list into day dividers +
 *  same-author/within-window clusters — purely a rendering concern, the
 *  underlying data/API is unchanged. */
function groupMessages(messages: MessageInfo[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let lastDayKey: string | null = null;

  for (const message of messages) {
    const dayKey = dayKeyIn(new Date(message.createdAt));
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Whether the list was scrolled to (near) the bottom before the latest
   *  render — only then do new messages auto-scroll, so reading older
   *  history isn't yanked away by someone else's message arriving. */
  const stickToBottomRef = useRef(true);
  const forceScrollRef = useRef(true);

  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const activeMessages = messagesByChannel[activeChannelId] ?? [];
  const channelLoading = isMember && activeChannelId !== "" && messagesByChannel[activeChannelId] === undefined;
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
  // Non-members can't read channels (the API 403s), and an error must
  // still store *something* — leaving the entry undefined would re-run
  // this effect and refetch in an endless loop.
  useEffect(() => {
    if (!isMember || !activeChannelId || messagesByChannel[activeChannelId]) return;
    let cancelled = false;
    fetch(`/api/channels/${activeChannelId}/messages`)
      .then(async (res) => (res.ok ? ((await res.json()) as { messages: MessageInfo[] }).messages : []))
      .catch(() => [] as MessageInfo[])
      .then((messages) => {
        if (!cancelled) setMessagesByChannel((prev) => ({ ...prev, [activeChannelId]: messages ?? [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [activeChannelId, messagesByChannel, isMember]);

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
      // Same reasoning as NotificationBell's own poll — a transient
      // network blip shouldn't crash this background poll; skip the
      // tick and retry next interval instead of an unhandled rejection.
      try {
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
      } catch {
        // Ignored — the next interval tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeChannelId, isMember]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !(stickToBottomRef.current || forceScrollRef.current)) return;
    el.scrollTo({ top: el.scrollHeight, behavior: forceScrollRef.current ? "auto" : "smooth" });
    forceScrollRef.current = false;
  }, [activeMessages.length, activeChannelId]);

  async function handleJoin() {
    setJoining(true);
    setError(null);
    const res = await fetch(`/api/communities/${communityId}/join`, { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      // Drop the empty placeholder lists a non-member was shown, so the
      // history effect loads real messages now that reads are allowed.
      setMessagesByChannel({});
      setIsMember(true);
    }
    else setError(data?.error ?? "Couldn't join. Try again.");
    setJoining(false);
  }

  async function handleSend(message: ComposerSubmit): Promise<boolean> {
    if (sending || !activeChannelId) return false;
    setSending(true);
    setError(null);
    const channelId = activeChannelId;

    let res: Response;
    try {
      if (message.kind === "IMAGE") {
        const form = new FormData();
        form.append("image", message.image.blob);
        form.append("caption", message.caption);
        form.append("width", String(message.image.width));
        form.append("height", String(message.image.height));
        res = await fetch(`/api/channels/${channelId}/messages`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/channels/${channelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.kind === "STICKER" ? { stickerId: message.stickerId } : { content: message.content }),
        });
      }
    } catch {
      setError("Message didn't send — check your connection and try again.");
      setSending(false);
      return false;
    }

    const data = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) {
      setError(data?.error ?? "Message didn't send. Try again.");
      return false;
    }
    forceScrollRef.current = true; // always jump to your own message
    setMessagesByChannel((prev) => ({ ...prev, [channelId]: mergeMessages(prev[channelId] ?? [], [data]) }));
    return true;
  }

  return (
    // Mobile: pinned between the fixed TopBar (60px) and the fixed
    // MobileTabBar (3.5rem + safe area), app-style — the message list
    // scrolls on its own and the composer always sits right above the tab
    // bar, instead of floating mid-screen under a short conversation.
    // `fixed` (not a 100dvh height calc) so AppShell's own bottom padding
    // for the tab bar can't double-count. The page exports
    // `interactiveWidget: "resizes-content"`, so on Android the keyboard
    // shrinks this box rather than covering the composer.
    // sm+ has no bottom tab bar, so the in-flow fixed-height panel is fine.
    <div className="fixed inset-x-0 top-[60px] bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-[1] flex flex-col bg-background sm:static sm:mx-auto sm:h-[calc(100dvh-96px)] sm:w-full sm:max-w-6xl sm:bg-transparent sm:p-6">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:rounded-t-[14px] sm:border sm:border-b-0 sm:bg-surface sm:px-5 sm:py-4">
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

      <div className="relative flex min-h-0 flex-1 sm:rounded-b-[14px] sm:border sm:border-border sm:bg-surface">
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
                    forceScrollRef.current = true;
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
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
            className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-6"
          >
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
                <div key={group.messages[0].id} className="flex flex-col gap-1.5">
                  {group.dayLabel && (
                    <div className="flex items-center gap-3 py-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-metadata shrink-0">{group.dayLabel}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className="flex items-start gap-2.5 pt-1">
                    <Avatar author={group.author} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold">{group.author.displayName}</span>
                        <span className="text-metadata shrink-0">{formatTime(group.messages[0].createdAt)}</span>
                      </div>
                      <MessageBody message={group.messages[0]} />
                    </div>
                  </div>
                  {/* Same author, within GROUP_WINDOW_MS — no repeated
                      avatar/name, just the text aligned under it. */}
                  {group.messages.slice(1).map((message) => (
                    <div key={message.id} className="flex items-start gap-2.5">
                      <span className="w-8 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <MessageBody message={message} />
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {error && <p className="field-error shrink-0 px-4 pb-1">{error}</p>}

          <div className="shrink-0 border-t border-border bg-background sm:rounded-br-[14px] sm:bg-surface">
            {isMember ? (
              <ChatComposer
                channelName={activeChannel?.name ?? ""}
                sending={sending}
                onSubmit={handleSend}
                onError={setError}
              />
            ) : (
              <div className="p-3">
                <button type="button" onClick={handleJoin} disabled={joining} className="btn-primary w-full">
                  {joining ? "Joining…" : "Join Community to Chat"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
