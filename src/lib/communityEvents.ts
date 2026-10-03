/**
 * Circuit — community events (FIFA night, a meetup, a watch party).
 * Moderators create and cancel them; members RSVP "going" or
 * "interested". New events are announced in the community's
 * #announcements. Tournaments a community hosts are listed alongside
 * these (Tournament.hostCommunityId), but live on their own pages.
 */

import type { RsvpStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canModerate, CommunityError, communityHref, effectiveRole, postSystemMessage } from "@/lib/community";

type Actor = { id: string; isStaff?: boolean };

export const EVENT_TITLE_MAX = 80;
export const EVENT_DESCRIPTION_MAX = 1000;
export const EVENT_LOCATION_MAX = 120;
/** Events stay "upcoming" this long after they start (they're usually a few hours). */
const RUNNING_GRACE_MS = 3 * 60 * 60 * 1000;

async function requireEventModerator(communityId: string, actor: Actor) {
  const community = await prisma.community.findUnique({ where: { id: communityId }, include: { tournament: { select: { organizerId: true } } } });
  if (!community || !community.enabled) throw new CommunityError("NOT_FOUND", "Community not found.");
  if (community.kind === "TOURNAMENT") throw new CommunityError("INVALID", "Tournament communities don't have separate events.");
  if (!canModerate(await effectiveRole(community, actor))) throw new CommunityError("FORBIDDEN", "Only moderators can manage events.");
  return community;
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const WHEN = (d: Date) =>
  d.toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" });

export async function createEvent(
  communityId: string,
  actor: Actor,
  input: { title?: unknown; description?: unknown; startsAt?: unknown; endsAt?: unknown; location?: unknown }
) {
  const community = await requireEventModerator(communityId, actor);
  const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
  if (title.length < 3 || title.length > EVENT_TITLE_MAX) throw new CommunityError("INVALID", `Titles are 3–${EVENT_TITLE_MAX} characters.`);
  const startsAt = parseDate(input.startsAt);
  if (!startsAt) throw new CommunityError("INVALID", "Pick when it starts.");
  if (startsAt.getTime() < Date.now() - 5 * 60 * 1000) throw new CommunityError("INVALID", "The start time is in the past.");
  if (startsAt.getTime() > Date.now() + 366 * 24 * 3600 * 1000) throw new CommunityError("INVALID", "Events can be scheduled up to a year ahead.");
  const endsAt = parseDate(input.endsAt);
  if (endsAt && endsAt <= startsAt) throw new CommunityError("INVALID", "It has to end after it starts.");
  const description = typeof input.description === "string" ? input.description.trim().slice(0, EVENT_DESCRIPTION_MAX) || null : null;
  const location = typeof input.location === "string" ? input.location.trim().slice(0, EVENT_LOCATION_MAX) || null : null;

  const event = await prisma.communityEvent.create({
    data: { communityId, title, description, startsAt, endsAt, location, createdById: actor.id },
  });
  await postSystemMessage(
    communityId,
    actor.id,
    `📅 New event: ${title} | ${WHEN(startsAt)}${location ? ` · ${location}` : ""}. RSVP: ${communityHref(community)}/events/${event.id}`
  ).catch(() => undefined);
  return event;
}

export async function cancelEvent(eventId: string, actor: Actor) {
  const event = await prisma.communityEvent.findUnique({ where: { id: eventId } });
  if (!event || event.cancelledAt) throw new CommunityError("NOT_FOUND", "Event not found.");
  await requireEventModerator(event.communityId, actor);
  await prisma.communityEvent.update({ where: { id: eventId }, data: { cancelledAt: new Date() } });
  await postSystemMessage(event.communityId, actor.id, `❌ Cancelled: ${event.title} (${WHEN(event.startsAt)}).`).catch(() => undefined);
}

/** Going / interested / clear (null). Members only, and only before it's over. */
export async function setRsvp(eventId: string, userId: string, status: RsvpStatus | null) {
  const event = await prisma.communityEvent.findUnique({ where: { id: eventId } });
  if (!event || event.cancelledAt) throw new CommunityError("NOT_FOUND", "This event was cancelled.");
  const over = (event.endsAt ?? new Date(event.startsAt.getTime() + RUNNING_GRACE_MS)) < new Date();
  if (over) throw new CommunityError("INVALID", "This event has finished.");
  if (!(await prisma.communityMember.count({ where: { communityId: event.communityId, userId } }))) {
    throw new CommunityError("NOT_A_MEMBER", "Join the community to RSVP.");
  }
  if (status === null) {
    await prisma.eventRsvp.deleteMany({ where: { eventId, userId } });
  } else {
    await prisma.eventRsvp.upsert({ where: { eventId_userId: { eventId, userId } }, update: { status }, create: { eventId, userId, status } });
  }
  return rsvpCounts(eventId);
}

async function rsvpCounts(eventId: string) {
  const groups = await prisma.eventRsvp.groupBy({ by: ["status"], where: { eventId }, _count: { _all: true } });
  return {
    going: groups.find((g) => g.status === "GOING")?._count._all ?? 0,
    interested: groups.find((g) => g.status === "INTERESTED")?._count._all ?? 0,
  };
}

export type EventCard = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  going: number;
  interested: number;
  viewerStatus: RsvpStatus | null;
};

/** Upcoming (or running) events, soonest first. */
export async function listUpcomingEvents(communityId: string, viewerId: string | null, take = 10): Promise<EventCard[]> {
  const events = await prisma.communityEvent.findMany({
    where: { communityId, cancelledAt: null, startsAt: { gte: new Date(Date.now() - RUNNING_GRACE_MS) } },
    orderBy: { startsAt: "asc" },
    take,
    include: { rsvps: { select: { status: true, userId: true } } },
  });
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    location: e.location,
    going: e.rsvps.filter((r) => r.status === "GOING").length,
    interested: e.rsvps.filter((r) => r.status === "INTERESTED").length,
    viewerStatus: e.rsvps.find((r) => r.userId === viewerId)?.status ?? null,
  }));
}

/** One event with who's going (for its page). */
export async function getEvent(eventId: string, viewerId: string | null) {
  const event = await prisma.communityEvent.findUnique({
    where: { id: eventId },
    include: {
      community: { select: { id: true, slug: true, name: true, iconUrl: true, tag: true, enabled: true, kind: true, tournamentId: true, joinPolicy: true } },
      rsvps: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true } } },
      },
    },
  });
  if (!event || !event.community.enabled) return null;
  const creator = await prisma.user.findUnique({ where: { id: event.createdById }, select: { displayName: true, handle: true } });
  return {
    event,
    creator,
    going: event.rsvps.filter((r) => r.status === "GOING").map((r) => r.user),
    interestedCount: event.rsvps.filter((r) => r.status === "INTERESTED").length,
    viewerStatus: event.rsvps.find((r) => r.userId === viewerId)?.status ?? null,
    over: (event.endsAt ?? new Date(event.startsAt.getTime() + RUNNING_GRACE_MS)) < new Date(),
  };
}
