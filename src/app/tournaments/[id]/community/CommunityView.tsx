"use client";

/**
 * Circuit Community — the chat. Channel sidebar (a slide-over on phones)
 * with the community's threads and events, the channel's message feed,
 * and a side panel (a sheet on phones) for a thread, the member list,
 * pinned messages or search. Messages support replies, @mentions,
 * reactions, threads and pins; streams poll (see chatShared.tsx).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Hash, Lock, Menu, MessagesSquare, Pin, Plus, Search, Users, X } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { DialogOverlay } from "@/components/ui/Overlay";
import { ChatComposer, type ComposerSubmit } from "@/components/community/ChatComposer";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { CommunityMenu, type CommunityMenuProps } from "@/components/community/CommunityMenu";
import { MembersPanel, PinsPanel, SearchPanel, ThreadPanel } from "@/components/community/CommunityPanels";
import { LOCAL_TIME_ZONE, MessageList, useMessageStream, type MessageInfo } from "@/components/community/chatShared";

type ChannelInfo = { id: string; key: string; name: string; modOnly?: boolean };
type Role = "OWNER" | "MODERATOR" | "MEMBER";
export type CommunityEvent = { id: string; name: string; startAt: string; status: string; href: string; going?: number };
type ThreadListItem = { id: string; title: string; channelId: string; channelName: string; messageCount: number; lastMessageAt: string; locked: boolean };
type Panel = { type: "thread"; id: string } | { type: "members" } | { type: "pins" } | { type: "search" } | null;

const THREADS_POLL_MS = 20_000;

export function CommunityView({
  communityId,
  backHref,
  title,
  channels,
  memberCount,
  initialChannelMessages,
  initialChannelId,
  initialServerTime,
  highlightMessageId,
  initialThreadId,
  viewerId,
  isMember: initialIsMember,
  iconUrl = null,
  tag = null,
  viewerRole = null,
  roleBadges = {},
  events = [],
  menu,
  mutedUntil = null,
}: {
  communityId: string;
  /** Where the back arrow goes. */
  backHref: string;
  title: string;
  channels: ChannelInfo[];
  memberCount: number;
  initialChannelMessages: MessageInfo[];
  /** Channel the page opened on; `initialChannelMessages` belong to it. */
  initialChannelId?: string;
  /** Server time the initial messages were read at (first poll's reactionsSince). */
  initialServerTime: string;
  /** Message to scroll to and flash (from a notification or search link). */
  highlightMessageId?: string;
  /** Thread to open in the side panel (a mention inside a thread). */
  initialThreadId?: string;
  viewerId: string;
  isMember: boolean;
  iconUrl?: string | null;
  tag?: string | null;
  /** The viewer's effective role — moderators post in mod-only channels,
   *  remove anyone's messages, pin and lock threads. */
  viewerRole?: Role | null;
  /** Owners/moderators, for the badge next to their name. */
  roleBadges?: Record<string, "OWNER" | "MODERATOR">;
  /** Upcoming tournaments this community hosts. */
  events?: CommunityEvent[];
  /** Header "…" menu (invite, about, settings, leave). */
  menu?: CommunityMenuProps;
  /** ISO time their timeout ends, if they're muted here. */
  mutedUntil?: string | null;
}) {
  const confirm = useConfirmDialog();
  const isModerator = viewerRole === "OWNER" || viewerRole === "MODERATOR";
  const startChannelId = initialChannelId ?? channels[0]?.id ?? "";
  const [activeChannelId, setActiveChannelId] = useState(startChannelId);
  const [flashId, setFlashId] = useState<string | null>(highlightMessageId ?? null);
  const [isMember, setIsMember] = useState(initialIsMember);
  const [joining, setJoining] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(initialThreadId ? { type: "thread", id: initialThreadId } : null);
  const [replyingTo, setReplyingTo] = useState<MessageInfo | null>(null);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [newThread, setNewThread] = useState<{ fromMessage: MessageInfo | null } | null>(null);
  const [threadTitle, setThreadTitle] = useState("");
  /** A message to scroll to once the list containing it has loaded. */
  const pendingJumpRef = useRef<string | null>(null);
  /** Set when jumping to a message in another channel: load around it once that channel opens. */
  const pendingAroundRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Only auto-scroll on new messages when already near the bottom. */
  const stickToBottomRef = useRef(true);
  const forceScrollRef = useRef(!highlightMessageId);

  const muted = !!mutedUntil && new Date(mutedUntil) > new Date();
  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
  const readOnlyHere = !!activeChannel?.modOnly && !isModerator;
  const stream = useMessageStream({
    channelId: activeChannelId,
    enabled: isMember && !!activeChannelId,
    initialMessages: initialChannelMessages,
    initialServerTime,
    onError: setError,
  });
  const messages = stream.messages ?? [];

  // Mark the whole community read once, on arrival.
  useEffect(() => {
    fetch(`/api/communities/${communityId}/read`, { method: "POST" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);

  // Keep the sidebar's thread list fresh.
  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/communities/${communityId}/threads`)
        .then(async (res) => (res.ok ? ((await res.json()) as { threads: ThreadListItem[] }).threads : null))
        .then((list) => !cancelled && list && setThreads(list))
        .catch(() => undefined);
    load();
    const interval = setInterval(load, THREADS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [communityId, isMember]);

  // Scroll to a highlighted/jumped-to message once it's rendered, else to the bottom.
  useEffect(() => {
    const target = pendingJumpRef.current ?? flashId;
    if (target && stream.messages && scrollToMessage(target)) {
      pendingJumpRef.current = null;
      return;
    }
    const el = scrollRef.current;
    if (!el || !(stickToBottomRef.current || forceScrollRef.current)) return;
    el.scrollTo({ top: el.scrollHeight, behavior: forceScrollRef.current ? "auto" : "smooth" });
    forceScrollRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the list changes
  }, [messages.length, activeChannelId, stream.messages === null]);

  // A flash fades a moment after its message is actually on screen (a
  // jump may first have to load the messages around it).
  const flashVisible = !!flashId && messages.some((m) => m.id === flashId);
  useEffect(() => {
    if (!flashVisible) return;
    const timer = setTimeout(() => setFlashId(null), 2600);
    return () => clearTimeout(timer);
  }, [flashVisible, flashId]);

  function scrollToMessage(id: string): boolean {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return false;
    stickToBottomRef.current = false;
    el.scrollIntoView({ block: "center" });
    return true;
  }

  function openChannel(id: string) {
    forceScrollRef.current = true;
    setReplyingTo(null);
    setActiveChannelId(id);
    setSidebarOpen(false);
  }

  /** Jump to a message in this channel's feed — loads the window around it if it isn't on screen. */
  function jumpTo(messageId: string, channelId = activeChannelId) {
    setFlashId(messageId);
    if (channelId === activeChannelId && scrollToMessage(messageId)) return;
    pendingJumpRef.current = messageId;
    if (channelId !== activeChannelId) {
      setActiveChannelId(channelId);
      // The new stream loads around the message (see effect below).
      pendingAroundRef.current = messageId;
      return;
    }
    if (!messages.some((m) => m.id === messageId)) stream.loadAround(messageId);
  }
  useEffect(() => {
    if (pendingAroundRef.current && stream.messages) {
      const id = pendingAroundRef.current;
      pendingAroundRef.current = null;
      if (!stream.messages.some((m) => m.id === id)) stream.loadAround(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- after the new channel's first load
  }, [stream.messages === null, activeChannelId]);

  async function handleJoin() {
    setJoining(true);
    setError(null);
    const res = await fetch(`/api/communities/${communityId}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await res.json().catch(() => null);
    if (res.ok) setIsMember(true);
    else setError(data?.error ?? "Couldn't join. Try again.");
    setJoining(false);
  }

  async function handleDelete(messageId: string) {
    const ok = await confirm({ title: "Remove this message?", message: "It will disappear for everyone.", confirmLabel: "Remove" });
    if (ok) await stream.remove(messageId);
  }

  async function handleSend(message: ComposerSubmit): Promise<boolean> {
    if (sending || !activeChannelId) return false;
    setSending(true);
    setError(null);
    const sent = await stream.send(message, replyingTo?.id);
    setSending(false);
    if (!sent) return false;
    setReplyingTo(null);
    forceScrollRef.current = true; // always jump to your own message
    return true;
  }

  async function createThread() {
    const fromMessage = newThread?.fromMessage ?? null;
    const res = await fetch(`/api/communities/${communityId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: activeChannelId, title: threadTitle, messageId: fromMessage?.id }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) return setError(data?.error ?? "Couldn't start the thread.");
    setNewThread(null);
    setThreadTitle("");
    setPanel({ type: "thread", id: data.id });
    setThreads((list) => [
      { id: data.id, title: data.title, channelId: activeChannelId, channelName: activeChannel?.name ?? "", messageCount: 0, lastMessageAt: new Date().toISOString(), locked: false },
      ...list.filter((t) => t.id !== data.id),
    ]);
    if (fromMessage) stream.update((list) => list.map((m) => (m.id === fromMessage.id ? { ...m, thread: { id: data.id, title: data.title, messageCount: 0, lastMessageAt: new Date().toISOString(), locked: false } } : m)));
  }

  const headerButton = (label: string, icon: React.ReactNode, active: boolean, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active} className={`btn-icon ${active ? "bg-surface-elevated text-foreground" : ""}`}>
      {icon}
    </button>
  );

  return (
    // Phones: pinned between the fixed TopBar (60px) and the fixed tab bar,
    // app-style. The page exports `interactiveWidget: "resizes-content"`,
    // so the Android keyboard shrinks this box rather than covering the composer.
    <div className="fixed inset-x-0 top-[60px] bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-[1] flex flex-col bg-background sm:static sm:mx-auto sm:h-[calc(100dvh-96px)] sm:w-full sm:max-w-7xl sm:bg-transparent sm:p-6">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 sm:gap-3 sm:rounded-t-[14px] sm:border sm:border-b-0 sm:bg-surface sm:px-5 sm:py-4">
        <button type="button" onClick={() => setSidebarOpen(true)} className="btn-icon sm:hidden" aria-label="Open channels">
          <Menu size={18} />
        </button>
        <Link href={backHref} className="flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground">
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <CommunityAvatar name={title} iconUrl={iconUrl} tag={tag} size="sm" className="hidden sm:flex" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-display text-base font-bold tracking-tight">{title}</span>
          <span className="text-metadata truncate">
            #{activeChannel?.name ?? "community"} · {memberCount} {memberCount === 1 ? "member" : "members"}
          </span>
        </div>
        {isMember && (
          <div className="flex items-center">
            {headerButton("Search", <Search size={17} />, panel?.type === "search", () => setPanel(panel?.type === "search" ? null : { type: "search" }))}
            {headerButton("Pinned messages", <Pin size={17} />, panel?.type === "pins", () => setPanel(panel?.type === "pins" ? null : { type: "pins" }))}
            {headerButton("Members", <Users size={17} />, panel?.type === "members", () => setPanel(panel?.type === "members" ? null : { type: "members" }))}
          </div>
        )}
        {menu && isMember && <CommunityMenu {...menu} />}
      </div>

      <div className="relative flex min-h-0 flex-1 sm:rounded-b-[14px] sm:border sm:border-border sm:bg-surface">
        {/* Channel sidebar — a column at sm+, a slide-over below it. */}
        <div className={`${sidebarOpen ? "flex" : "hidden"} absolute inset-0 z-20 flex-col overflow-y-auto bg-surface sm:relative sm:z-0 sm:flex sm:w-56 sm:shrink-0 sm:border-r sm:border-border sm:bg-surface-elevated/40`}>
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
                  onClick={() => openChannel(channel.id)}
                  className={`flex items-center gap-1.5 rounded-none border-l-2 px-2.5 py-1.5 text-left text-sm font-medium transition ${
                    active ? "border-accent-blue bg-surface-elevated text-foreground" : "border-transparent text-muted hover:bg-surface-elevated/60 hover:text-foreground"
                  }`}
                >
                  <Hash size={14} className="shrink-0" />
                  <span className="truncate">{channel.name}</span>
                  {channel.modOnly && <Lock size={11} className="ml-auto shrink-0 opacity-60" aria-label="Moderators post here" />}
                </button>
              );
            })}
          </div>

          {isMember && (
            <>
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="text-eyebrow">Threads</span>
                {!muted && (!activeChannel?.modOnly || isModerator) && (
                  <button type="button" onClick={() => setNewThread({ fromMessage: null })} aria-label="New thread" title="New thread" className="rounded-none p-0.5 text-muted hover:bg-surface-elevated hover:text-foreground">
                    <Plus size={14} />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5 p-2 pt-0">
                {threads.length === 0 ? (
                  <p className="px-2.5 py-1 text-xs text-muted">No threads yet.</p>
                ) : (
                  threads.slice(0, 10).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPanel({ type: "thread", id: t.id });
                        setSidebarOpen(false);
                      }}
                      className={`flex items-start gap-2 rounded-none px-2.5 py-1.5 text-left text-sm transition ${
                        panel?.type === "thread" && panel.id === t.id ? "bg-surface-elevated text-foreground" : "text-muted hover:bg-surface-elevated/60 hover:text-foreground"
                      }`}
                    >
                      <MessagesSquare size={14} className="mt-0.5 shrink-0" />
                      <span className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-1 truncate font-medium">
                          <span className="truncate">{t.title}</span>
                          {t.locked && <Lock size={10} className="shrink-0 opacity-60" />}
                        </span>
                        <span className="text-[11px]">
                          #{t.channelName} · {t.messageCount} {t.messageCount === 1 ? "reply" : "replies"}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {events.length > 0 && (
            <>
              <span className="text-eyebrow px-3 pt-3 pb-1">Events</span>
              <div className="flex flex-col gap-0.5 p-2 pt-0">
                {events.map((event) => (
                  <Link key={event.id} href={event.href} className="flex items-start gap-2 rounded-none px-2.5 py-1.5 text-sm text-muted transition hover:bg-surface-elevated/60 hover:text-foreground">
                    <CalendarDays size={14} className="mt-0.5 shrink-0" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{event.name}</span>
                      <span className="text-[11px]">
                        {event.status === "LIVE"
                          ? "Live now"
                          : new Date(event.startAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: LOCAL_TIME_ZONE })}
                        {event.going ? ` · ${event.going} going` : ""}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Message pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
            className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-5 pb-6"
          >
            {stream.loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner size={20} className="text-muted" />
              </div>
            ) : messages.length === 0 ? (
              <p className="flex flex-1 items-center justify-center text-center text-sm text-muted">
                {isMember ? `No messages yet. Be the first to say something in #${activeChannel?.name}.` : "Join to read and post in this community."}
              </p>
            ) : (
              <MessageList
                messages={messages}
                viewerId={viewerId}
                isModerator={isModerator}
                roleBadges={roleBadges}
                flashId={flashId}
                handlers={{
                  onReact: stream.react,
                  onDelete: handleDelete,
                  onReply: muted || readOnlyHere ? undefined : setReplyingTo,
                  onStartThread: muted || (activeChannel?.modOnly && !isModerator) ? undefined : (m) => (setThreadTitle(m.content.slice(0, 80)), setNewThread({ fromMessage: m })),
                  onTogglePin: (m) => stream.togglePin(m.id, !m.pinned),
                  onOpenThread: (id) => setPanel({ type: "thread", id }),
                  onJumpTo: (id) => jumpTo(id),
                }}
              />
            )}
          </div>

          {error && <p className="field-error shrink-0 px-4 pb-1">{error}</p>}

          <div className="shrink-0 border-t border-border bg-background sm:rounded-br-[14px] sm:bg-surface">
            {isMember && muted ? (
              <p className="flex items-center justify-center gap-1.5 px-4 py-4 text-center text-sm text-muted">
                <Lock size={14} /> You&apos;re muted here until{" "}
                {new Date(mutedUntil!).toLocaleString("en-NG", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: LOCAL_TIME_ZONE })}.
              </p>
            ) : isMember && readOnlyHere ? (
              <p className="flex items-center justify-center gap-1.5 px-4 py-4 text-center text-sm text-muted">
                <Lock size={14} /> Only moderators post in #{activeChannel?.name}.
              </p>
            ) : isMember ? (
              <ChatComposer
                communityId={communityId}
                channelName={activeChannel?.name ?? ""}
                sending={sending}
                onSubmit={handleSend}
                onError={setError}
                replyingTo={replyingTo ? { authorName: replyingTo.author.displayName, snippet: replyingTo.content.slice(0, 80) } : null}
                onCancelReply={() => setReplyingTo(null)}
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

        {/* Side panel — a column at lg+, a full sheet below it. */}
        {panel && isMember && (
          <div className="absolute inset-0 z-30 flex flex-col bg-surface lg:relative lg:inset-auto lg:z-0 lg:w-[360px] lg:shrink-0 lg:border-l lg:border-border lg:rounded-br-[14px]">
            {panel.type === "thread" && (
              <ThreadPanel key={panel.id} threadId={panel.id} communityId={communityId} viewerId={viewerId} roleBadges={roleBadges} muted={muted} onClose={() => setPanel(null)} />
            )}
            {panel.type === "members" && <MembersPanel communityId={communityId} onClose={() => setPanel(null)} />}
            {panel.type === "pins" && activeChannel && (
              <PinsPanel
                channelId={activeChannel.id}
                channelName={activeChannel.name}
                onJump={(id) => {
                  jumpTo(id);
                  if (window.innerWidth < 1024) setPanel(null);
                }}
                onClose={() => setPanel(null)}
              />
            )}
            {panel.type === "search" && (
              <SearchPanel
                communityId={communityId}
                onOpen={({ messageId, channelId, threadId }) => {
                  if (threadId) setPanel({ type: "thread", id: threadId });
                  else {
                    jumpTo(messageId, channelId);
                    if (window.innerWidth < 1024) setPanel(null);
                  }
                }}
                onClose={() => setPanel(null)}
              />
            )}
          </div>
        )}
      </div>

      <DialogOverlay open={!!newThread} onClose={() => setNewThread(null)} label="Start a thread" maxWidth={440}>
        <div className="flex flex-col gap-3 px-5 pb-5 sm:pt-5">
          <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">New thread in #{activeChannel?.name}</p>
          {newThread?.fromMessage && (
            <p className="line-clamp-2 rounded-none border-l-2 border-border-strong bg-surface-elevated/50 px-3 py-2 text-sm text-muted">
              <span className="font-semibold text-foreground">{newThread.fromMessage.author.displayName}:</span> {newThread.fromMessage.content || "📷 Image"}
            </p>
          )}
          <input
            value={threadTitle}
            onChange={(e) => setThreadTitle(e.target.value)}
            maxLength={80}
            placeholder="e.g. Looking for COD teammates"
            className="field-input h-11"
            aria-label="Thread title"
            autoFocus
          />
          <button type="button" onClick={createThread} disabled={threadTitle.trim().length < 2} className="btn-primary h-11">
            Start thread
          </button>
        </div>
      </DialogOverlay>
    </div>
  );
}
