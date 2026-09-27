/**
 * Circuit — a community's public face: what someone sees before joining
 * (and members see under "About"). Banner, crest, what it's about, real
 * numbers (members, who's been talking this week), rules, channels,
 * upcoming events it hosts and who runs it. The join control itself is
 * passed in as `action`, since it depends on who's looking.
 */

import Link from "next/link";
import { ArrowLeft, BadgeCheck, CalendarDays, Crown, Hash, Lock, MapPin, MessageCircle, ScrollText, Shield, Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { ShareButton } from "@/components/ShareButton";
import { CommunityAvatar } from "./CommunityAvatar";

type Props = {
  community: {
    name: string;
    description: string | null;
    iconUrl: string | null;
    bannerUrl: string | null;
    tag: string | null;
    kind: "GLOBAL" | "TOURNAMENT" | "GAME_HUB" | "OFFICIAL" | "PLAYER";
    joinPolicy: "OPEN" | "APPLY" | "INVITE";
    rules: string | null;
    region: string | null;
    gameName: string | null;
    createdAt: Date;
  };
  shareUrl: string;
  memberCount: number;
  activeThisWeek: number;
  channels: { id: string; name: string; modOnly: boolean }[];
  events: { id: string; name: string; startAt: Date; status: string; game: string }[];
  moderators: { id: string; handle: string; displayName: string; avatarUrl: string | null; role: string }[];
  action: React.ReactNode;
  /** The Teams section (client component), if any. */
  teamsSection?: React.ReactNode;
  /** The community's own events (FIFA night, meetups). */
  communityEvents?: { id: string; title: string; startsAt: Date; location: string | null; going: number; href: string }[];
  /** Moderators: "Create event". */
  eventsAction?: React.ReactNode;
  backHref?: string;
};

const POLICY_LABEL = { OPEN: "Anyone can join", APPLY: "Moderators approve new members", INVITE: "Invite only" } as const;

export function CommunityProfile({
  community: c,
  shareUrl,
  memberCount,
  activeThisWeek,
  channels,
  events,
  moderators,
  action,
  teamsSection,
  communityEvents = [],
  eventsAction,
  backHref = "/communities",
}: Props) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col pb-10">
      <div className="relative h-40 w-full overflow-hidden sm:mt-6 sm:h-56 sm:rounded-[20px]">
        {c.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded or external banner
          <img src={c.bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : c.gameName ? (
          <GameArtTile game={c.gameName} className="h-full w-full" hideLabel />
        ) : (
          <div className="h-full w-full bg-[#15181d] bg-[radial-gradient(80%_120%_at_80%_0%,color-mix(in_srgb,var(--accent-volt)_32%,transparent),transparent_60%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <Link
          href={backHref}
          className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur-sm transition hover:bg-black/60"
        >
          <ArrowLeft size={14} /> Communities
        </Link>
      </div>

      <div className="flex flex-col gap-6 px-4 sm:px-8">
        <div className="flex items-end justify-between gap-3">
          {/* Only the crest overlaps the banner; the name sits below it. */}
          <div className="flex items-end gap-4">
            <CommunityAvatar name={c.name} iconUrl={c.iconUrl} tag={c.tag} size="xl" className="relative z-10 -mt-10 sm:-mt-12" />
            <div className="flex min-w-0 flex-col gap-1 pb-1">
              <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
                {c.name}
                {c.kind !== "PLAYER" && <BadgeCheck size={22} className="text-accent-volt" aria-label="Official" />}
                {c.tag && <span className="rounded-[6px] border border-border px-1.5 py-0.5 font-mono text-xs font-semibold text-muted">{c.tag}</span>}
              </h1>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                {c.kind === "GAME_HUB" && <span>Official game hub</span>}
                {c.kind === "OFFICIAL" && <span>Official community</span>}
                {c.kind !== "GAME_HUB" && c.gameName && <span>{c.gameName}</span>}
                {c.region && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {c.region}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pb-1">
            <ShareButton title={`${c.name} on Circuit`} url={shareUrl} variant="compact" />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-6">
            {c.description && <p className="max-w-2xl text-[15px] leading-relaxed">{c.description}</p>}

            <dl className="grid grid-cols-3 gap-2 sm:max-w-md">
              <Stat icon={<Users size={14} />} label="Members" value={memberCount.toLocaleString("en-NG")} />
              <Stat icon={<MessageCircle size={14} />} label="Chatting this week" value={String(activeThisWeek)} />
              <Stat icon={<Hash size={14} />} label="Channels" value={String(channels.length)} />
            </dl>

            <div className="flex flex-col gap-2">
              {action}
              <p className="flex items-center gap-1.5 text-xs text-muted">
                {c.joinPolicy === "OPEN" ? <Users size={12} /> : <Lock size={12} />} {POLICY_LABEL[c.joinPolicy]}
              </p>
            </div>

            {(events.length > 0 || communityEvents.length > 0 || eventsAction) && (
              <section className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold tracking-tight">Upcoming events</h2>
                  {eventsAction}
                </div>
                {events.length === 0 && communityEvents.length === 0 && <p className="text-sm text-muted">Nothing scheduled yet.</p>}
                <div className="flex flex-col gap-2">
                  {communityEvents.map((e) => (
                    <Link key={e.id} href={e.href} className="card-row flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3">
                      <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[10px] bg-accent-volt text-accent-volt-foreground">
                        <span className="font-mono text-[9px] leading-none font-semibold uppercase">{e.startsAt.toLocaleDateString("en-NG", { month: "short", timeZone: "Africa/Lagos" })}</span>
                        <span className="font-display text-base leading-none font-bold">{e.startsAt.toLocaleDateString("en-NG", { day: "numeric", timeZone: "Africa/Lagos" })}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold">{e.title}</span>
                        <span className="truncate text-xs text-muted">
                          {e.startsAt.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}
                          {e.location ? ` · ${e.location}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{e.going} going</span>
                    </Link>
                  ))}
                  {events.map((e) => (
                    <Link key={e.id} href={`/tournaments/${e.id}`} className="card-row flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-muted">
                        <CalendarDays size={17} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold">{e.name}</span>
                        <span className="text-xs text-muted">
                          {e.game} ·{" "}
                          {e.status === "LIVE"
                            ? "Live now"
                            : e.startAt.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" })}
                        </span>
                      </span>
                      {e.status === "LIVE" ? <span className="badge badge-live">Live</span> : e.status === "OPEN" ? <span className="badge badge-open">Open</span> : null}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {teamsSection}

            {c.rules && (
              <section className="flex flex-col gap-2.5">
                <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
                  <ScrollText size={17} /> Rules
                </h2>
                <div className="rounded-[14px] border border-border bg-surface px-4 py-3 text-[14px] leading-relaxed whitespace-pre-line text-muted">{c.rules}</div>
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-5">
            <section className="flex flex-col gap-2 rounded-[16px] border border-border bg-surface p-4">
              <h2 className="text-eyebrow">Channels</h2>
              <ul className="flex flex-col gap-1">
                {channels.map((ch) => (
                  <li key={ch.id} className="flex items-center gap-1.5 text-sm text-muted">
                    <Hash size={13} /> {ch.name}
                    {ch.modOnly && <Lock size={11} className="opacity-60" />}
                  </li>
                ))}
              </ul>
            </section>
            {moderators.length > 0 && (
              <section className="flex flex-col gap-2.5 rounded-[16px] border border-border bg-surface p-4">
                <h2 className="text-eyebrow">Run by</h2>
                <ul className="flex flex-col gap-2">
                  {moderators.map((m) => (
                    <li key={m.id}>
                      <Link href={`/players/${m.handle}`} className="flex items-center gap-2.5 text-sm hover:underline">
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- external avatar
                          <img src={m.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted">
                            {m.displayName.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium">{m.displayName}</span>
                        {m.role === "OWNER" ? <Crown size={13} className="text-accent-volt" aria-label="Owner" /> : <Shield size={13} className="text-muted" aria-label="Moderator" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="px-1 text-xs text-muted-strong">
              Since {c.createdAt.toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "Africa/Lagos" })}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-border bg-surface px-3 py-2.5">
      <dd className="font-display text-xl font-bold tabular-nums">{value}</dd>
      <dt className="flex items-center gap-1 text-[11px] leading-tight text-muted">
        {icon} {label}
      </dt>
    </div>
  );
}
