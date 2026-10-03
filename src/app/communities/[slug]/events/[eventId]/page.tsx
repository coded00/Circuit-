/**
 * Circuit — one community event: when/where, who's going, RSVP, share and
 * add-to-calendar. Public (it's what gets shared), but only members RSVP.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CalendarPlus, MapPin, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canModerate, effectiveRole } from "@/lib/community";
import { getEvent } from "@/lib/communityEvents";
import { signupPath } from "@/lib/safeRedirect";
import { SITE_URL } from "@/lib/seo";
import { ShareButton } from "@/components/ShareButton";
import { CommunityAvatar } from "@/components/community/CommunityAvatar";
import { RsvpButtons, SignUpToRsvp } from "@/components/community/EventControls";
import { CancelEventButton } from "@/components/community/CancelEventButton";

type Params = { params: Promise<{ slug: string; eventId: string }> };

const WHEN = (d: Date) => d.toLocaleString("en-NG", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });
const gcal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const data = await getEvent((await params).eventId, null);
  if (!data) return { title: "Event not found" };
  return {
    title: `${data.event.title} · ${data.event.community.name}`,
    description: `${WHEN(data.event.startsAt)}${data.event.location ? ` · ${data.event.location}` : ""}. ${data.going.length} going.`,
  };
}

export default async function CommunityEventPage({ params }: Params) {
  const { slug, eventId } = await params;
  const user = await getCurrentUser();
  const data = await getEvent(eventId, user?.id ?? null);
  if (!data || data.event.community.slug !== slug) notFound();
  const { event, creator, going, interestedCount, viewerStatus, over } = data;
  const community = event.community;
  const here = `/communities/${slug}/events/${event.id}`;

  const [isMember, isMod] = user
    ? await Promise.all([
        prisma.communityMember.count({ where: { communityId: community.id, userId: user.id } }).then((n) => n > 0),
        prisma.community
          .findUnique({ where: { id: community.id }, include: { tournament: { select: { organizerId: true } } } })
          .then(async (c) => !!c && canModerate(await effectiveRole(c, user))),
      ])
    : [false, false];

  const end = event.endsAt ?? new Date(event.startsAt.getTime() + 2 * 3600 * 1000);
  const calendarUrl =
    "https://calendar.google.com/calendar/render?" +
    new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${gcal(event.startsAt)}/${gcal(end)}`,
      details: `${event.description ?? ""}\n\n${SITE_URL}${here}`.trim(),
      location: event.location ?? "",
    }).toString();

  const blocked = event.cancelledAt ? (
    <p className="text-sm font-medium text-danger">This event was cancelled.</p>
  ) : over ? (
    <p className="text-sm text-muted">This event has finished.</p>
  ) : !user ? (
    <SignUpToRsvp href={signupPath(here)} />
  ) : (
    <Link href={`/communities/${slug}`} className="btn-secondary h-11 w-fit px-5">
      Join {community.name} to RSVP
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Link href={`/communities/${slug}`} className="flex w-fit items-center gap-2 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft size={15} />
        <CommunityAvatar name={community.name ?? "?"} iconUrl={community.iconUrl} tag={community.tag} size="sm" className="!h-6 !w-6" />
        {community.name}
      </Link>

      <header className="flex flex-col gap-3">
        <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
          <span className="h-px w-6 bg-accent-volt" aria-hidden />
          Community event
        </span>
        <h1 className={`font-display text-[30px] leading-[1] font-bold tracking-tight sm:text-[40px] ${event.cancelledAt ? "text-muted line-through" : ""}`}>{event.title}</h1>
        <ul className="flex flex-col gap-1.5 text-[15px]">
          <li className="flex items-center gap-2">
            <CalendarDays size={16} className="shrink-0 text-muted" /> {WHEN(event.startsAt)}
            {event.endsAt && <span className="text-muted">– {event.endsAt.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })}</span>}
          </li>
          {event.location && (
            <li className="flex items-center gap-2">
              <MapPin size={16} className="shrink-0 text-muted" /> {event.location}
            </li>
          )}
          {creator && <li className="text-sm text-muted">Hosted by {creator.displayName}</li>}
        </ul>
      </header>

      <RsvpButtons
        eventId={event.id}
        initialStatus={viewerStatus}
        initialCounts={{ going: going.length, interested: interestedCount }}
        canRsvp={!!user && isMember && !over && !event.cancelledAt}
        blockedReason={blocked}
      />

      <div className="flex flex-wrap gap-2">
        {!event.cancelledAt && !over && (
          <a href={calendarUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary h-10 gap-1.5 px-4 text-sm">
            <CalendarPlus size={15} /> Add to Google Calendar
          </a>
        )}
        <ShareButton title={`${event.title} | ${community.name} on Circuit`} url={`${SITE_URL}${here}`} />
        {isMod && !event.cancelledAt && !over && <CancelEventButton eventId={event.id} />}
      </div>

      {event.description && <p className="cut-sm [--cut-line:var(--border)] border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line">{event.description}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <Users size={17} /> Going · {going.length}
        </h2>
        {going.length === 0 ? (
          <p className="text-sm text-muted">Nobody yet. Be the first.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {going.slice(0, 40).map((u) => (
              <li key={u.id}>
                <Link href={`/players/${u.handle}`} className="flex items-center gap-2 cut-xs border border-border bg-surface py-1 pr-3 pl-1 text-sm font-medium hover:border-border-hover">
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external avatar
                    <img src={u.avatarUrl} alt="" className="h-6 w-6 cut-avatar object-cover" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center cut-avatar bg-surface-elevated text-[11px] font-semibold text-muted">{u.displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                  {u.displayName}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
