/**
 * Circuit — finding and creating communities.
 *
 * - Game hubs: one official, staff-owned community per published catalog
 *   game, created on demand (ensureGameHubs) so a newly published game
 *   gets its hub without a separate step.
 * - Discovery lists game hubs and player communities that are OPEN or
 *   APPLY (INVITE ones are unlisted), ranked by the last 7 days of real
 *   activity: how many different people posted matters most, member count
 *   not at all (see activityScore in communityRules.ts).
 */

import { Prisma, type CommunityJoinPolicy, type CommunityKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { channelRows, COMMUNITY_CHANNELS, CommunityError, communityHref } from "@/lib/community";
import {
  activityLabel,
  activityScore,
  APPLICATION_QUESTION_MAX,
  COMMUNITY_DESCRIPTION_MAX,
  COMMUNITY_RULES_MAX,
  MAX_OWNED_COMMUNITIES,
  optionalText,
  slugify,
  SLUG_RULES_MESSAGE,
  validateCommunityName,
  validateSlug,
  validateTag,
  isCommunityCategory,
  type ActivityStats,
  type CommunityCategoryValue,
} from "@/lib/communityRules";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Communities anyone can find: Circuit itself, enabled game hubs (for a
 *  published game) and player communities that aren't invite-only. */
export const LISTED_WHERE: Prisma.CommunityWhereInput = {
  enabled: true,
  OR: [
    { kind: "GLOBAL" },
    { kind: "OFFICIAL" },
    { kind: "GAME_HUB", game: { enabled: true, publishedAt: { not: null } } },
    { kind: "PLAYER", joinPolicy: { in: ["OPEN", "APPLY"] } },
  ],
};

async function uniqueSlug(base: string): Promise<string> {
  const root = validateSlug(base, { allowReserved: true }) ?? "community";
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? root : `${root.slice(0, 28)}-${i + 1}`;
    if (!(await prisma.community.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  return `${root.slice(0, 20)}-${Date.now().toString(36)}`;
}

/** Creates the missing hub for every published game and returns how many
 *  it made. Idempotent, and safe under concurrent calls (advisory lock). */
export async function ensureGameHubs(): Promise<number> {
  let created = 0;
  const games = await prisma.game.findMany({
    where: { enabled: true, publishedAt: { not: null }, communities: { none: { kind: "GAME_HUB" } } },
    select: { id: true, name: true, iconUrl: true, coverUrl: true },
  });
  for (const game of games) {
    try {
      const made = await prisma.$transaction(async (tx) => {
        // Two first visitors racing here must not create two hubs for one
        // game: whoever gets the per-game lock creates it (after a
        // re-check); anyone else skips rather than waits.
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${"game-hub:" + game.id})) AS locked`;
        if (!locked) return false;
        if (await tx.community.findFirst({ where: { kind: "GAME_HUB", gameId: game.id }, select: { id: true } })) return false;
        const community = await tx.community.create({
          data: {
            kind: "GAME_HUB",
            slug: await uniqueSlug(slugify(game.name)),
            name: game.name,
            description: `The official ${game.name} community on Circuit. Find squads, share clips and hear about tournaments first.`,
            iconUrl: game.iconUrl,
            bannerUrl: game.coverUrl,
            gameId: game.id,
            joinPolicy: "OPEN",
          },
        });
        await tx.channel.createMany({ data: channelRows(community.id, COMMUNITY_CHANNELS) });
        return true;
      });
      if (made) created++;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  return created;
}

/** The official location and interest communities Circuit starts with.
 *  Staff add more from Admin → Communities. */
export const OFFICIAL_SEED: { name: string; category: "LOCATION" | "INTEREST"; region?: string; description: string }[] = [
  ...["Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City", "Accra"].map((city) => ({
    name: city,
    category: "LOCATION" as const,
    region: city,
    description: `Gamers in ${city}. Find people to play with, local tournaments and meetups.`,
  })),
  { name: "Competitive Gaming", category: "INTEREST", description: "For players chasing ranks, trophies and prize money. Scrims, strategy and tournament talk." },
  { name: "Casual Gaming", category: "INTEREST", description: "No pressure, just games. Find chill squads and people to play with." },
  { name: "Gaming News", category: "INTEREST", description: "Patches, releases and esports news — and what everyone thinks about it." },
  { name: "Content Creators", category: "INTEREST", description: "Streamers, YouTubers and clip makers. Share your work, collab and grow." },
];

/** Creates any missing seed community (by slug). Same concurrency guard
 *  as the game hubs. Returns how many it made. */
export async function ensureOfficialCommunities(): Promise<number> {
  const slugs = OFFICIAL_SEED.map((o) => slugify(o.name));
  const existing = new Set((await prisma.community.findMany({ where: { slug: { in: slugs } }, select: { slug: true } })).map((c) => c.slug));
  let created = 0;
  for (const seed of OFFICIAL_SEED) {
    const slug = slugify(seed.name);
    if (existing.has(slug)) continue;
    try {
      const made = await prisma.$transaction(async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${"official:" + slug})) AS locked`;
        if (!locked || (await tx.community.findUnique({ where: { slug }, select: { id: true } }))) return false;
        const community = await tx.community.create({
          data: { kind: "OFFICIAL", slug, name: seed.name, category: seed.category, region: seed.region ?? null, description: seed.description, joinPolicy: "OPEN" },
        });
        await tx.channel.createMany({ data: channelRows(community.id, COMMUNITY_CHANNELS) });
        return true;
      });
      if (made) created++;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  return created;
}

/** Staff create another official location/interest community. */
export async function createOfficialCommunity(input: CommunityInput) {
  if (input.category !== "LOCATION" && input.category !== "INTEREST") throw new CommunityInputError("category", "Official communities are Location or Interest.");
  const data = await parseCommunityInput(input, { partial: false, requireSafeguards: false });
  const slug = validateSlug(typeof input.slug === "string" && input.slug ? input.slug : slugify(String(data.name)), { allowReserved: true });
  if (!slug) throw new CommunityInputError("slug", SLUG_RULES_MESSAGE);
  try {
    return await prisma.$transaction(async (tx) => {
      const community = await tx.community.create({ data: { ...(data as Prisma.CommunityUncheckedCreateInput), kind: "OFFICIAL", slug, joinPolicy: "OPEN" } });
      await tx.channel.createMany({ data: channelRows(community.id, COMMUNITY_CHANNELS) });
      return community;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new CommunityInputError("slug", "That link is taken.");
    throw err;
  }
}

/** Last-7-days messages, distinct posters and new members per community. */
export async function getActivityStats(communityIds: string[]): Promise<Map<string, ActivityStats>> {
  const stats = new Map<string, ActivityStats>(communityIds.map((id) => [id, { messages: 0, posters: 0, newMembers: 0 }]));
  if (communityIds.length === 0) return stats;
  const since = new Date(Date.now() - WEEK_MS);
  const [chat, joins] = await Promise.all([
    prisma.$queryRaw<{ communityId: string; messages: number; posters: number }[]>`
      SELECT ch."communityId", COUNT(*)::int AS messages, COUNT(DISTINCT m."authorId")::int AS posters
      FROM "Message" m JOIN "Channel" ch ON ch."id" = m."channelId"
      WHERE m."createdAt" >= ${since} AND m."deletedAt" IS NULL AND m."isSystem" = false
        AND ch."communityId" IN (${Prisma.join(communityIds)})
      GROUP BY ch."communityId"`,
    prisma.communityMember.groupBy({
      by: ["communityId"],
      where: { communityId: { in: communityIds }, joinedAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);
  for (const row of chat) Object.assign(stats.get(row.communityId)!, { messages: row.messages, posters: row.posters });
  for (const row of joins) stats.get(row.communityId)!.newMembers = row._count._all;
  return stats;
}

export type CommunityCard = {
  id: string;
  href: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
  tag: string | null;
  kind: CommunityKind;
  joinPolicy: CommunityJoinPolicy;
  gameName: string | null;
  region: string | null;
  category: string | null;
  memberCount: number;
  isMember: boolean;
  activity: ActivityStats;
  activityLabel: string | null;
  createdAt: Date;
};

const CARD_INCLUDE = (viewerId: string) =>
  ({
    game: { select: { name: true } },
    _count: { select: { members: true } },
    members: { where: { userId: viewerId }, select: { id: true } },
  }) satisfies Prisma.CommunityInclude;

type CardRow = Prisma.CommunityGetPayload<{ include: ReturnType<typeof CARD_INCLUDE> }>;

function toCard(c: CardRow, activity: ActivityStats): CommunityCard {
  return {
    id: c.id,
    href: communityHref(c),
    name: c.name ?? "Community",
    description: c.description,
    iconUrl: c.iconUrl,
    bannerUrl: c.bannerUrl,
    tag: c.tag,
    kind: c.kind,
    joinPolicy: c.joinPolicy,
    gameName: c.game?.name ?? null,
    region: c.region,
    category: c.category,
    memberCount: c._count.members,
    isMember: c.members.length > 0,
    activity,
    activityLabel: activityLabel(activity),
    createdAt: c.createdAt,
  };
}

export type DiscoverSort = "active" | "new" | "members";
export type DiscoverFilters = { q?: string; game?: string; region?: string; category?: string; sort?: DiscoverSort };

/** Search/filter over listed communities. Candidates are capped (by most
 *  recent activity) before ranking — plenty at Circuit's scale. */
export async function discoverCommunities(viewerId: string, filters: DiscoverFilters, limit = 30): Promise<CommunityCard[]> {
  const q = filters.q?.trim().slice(0, 60);
  const region = filters.region?.trim().slice(0, 60);
  const rows = await prisma.community.findMany({
    where: {
      AND: [
        LISTED_WHERE,
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { tag: { equals: q.toUpperCase() } },
              ],
            }
          : {},
        filters.game ? { game: { name: filters.game } } : {},
        region ? { region: { contains: region, mode: "insensitive" } } : {},
        isCommunityCategory(filters.category) ? { category: filters.category } : {},
      ],
    },
    orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
    include: CARD_INCLUDE(viewerId),
  });
  const stats = await getActivityStats(rows.map((r) => r.id));
  const cards = rows.map((r) => toCard(r, stats.get(r.id)!));
  const sort = filters.sort ?? "active";
  cards.sort((a, b) => {
    if (sort === "new") return b.createdAt.getTime() - a.createdAt.getTime();
    if (sort === "members") return b.memberCount - a.memberCount;
    return activityScore(b.activity) - activityScore(a.activity) || b.memberCount - a.memberCount;
  });
  return cards.slice(0, limit);
}

export type DiscoveryHome = {
  hubs: CommunityCard[];
  cities: CommunityCard[];
  interests: CommunityCard[];
  active: CommunityCard[];
  newest: CommunityCard[];
  nearYou: CommunityCard[];
};

/** The unfiltered /communities page: official hubs, then player
 *  communities by activity, newest, and near the viewer's region. */
export async function getDiscoveryHome(viewer: { id: string; region: string | null }): Promise<DiscoveryHome> {
  const rows = await prisma.community.findMany({
    where: LISTED_WHERE,
    orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
    include: CARD_INCLUDE(viewer.id),
  });
  const stats = await getActivityStats(rows.map((r) => r.id));
  const cards = rows.map((r) => toCard(r, stats.get(r.id)!));
  const byActivity = (a: CommunityCard, b: CommunityCard) => activityScore(b.activity) - activityScore(a.activity) || b.memberCount - a.memberCount;
  const players = cards.filter((c) => c.kind === "PLAYER");
  const region = viewer.region?.trim().toLowerCase();
  return {
    // Circuit first, then the game hubs by activity.
    hubs: [...cards.filter((c) => c.kind === "GLOBAL"), ...cards.filter((c) => c.kind === "GAME_HUB").sort(byActivity)],
    cities: cards.filter((c) => c.kind === "OFFICIAL" && c.category === "LOCATION").sort(byActivity),
    interests: cards.filter((c) => c.kind === "OFFICIAL" && c.category === "INTEREST").sort(byActivity),
    active: [...players].filter((c) => activityScore(c.activity) > 0).sort(byActivity).slice(0, 12),
    newest: [...players].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 12),
    nearYou: region ? [...cards.filter((c) => c.kind === "OFFICIAL" && c.category === "LOCATION"), ...players].filter((c) => c.region?.toLowerCase().includes(region) || (c.region && region.includes(c.region.toLowerCase()))).sort(byActivity).slice(0, 12) : [],
  };
}

/** Onboarding: joins the hubs for the chosen games and remembers them on
 *  the profile. Unknown ids are ignored. Returns how many were joined. */
export async function joinGameHubs(userId: string, gameIds: string[]): Promise<number> {
  const hubs = await prisma.community.findMany({
    where: { kind: "GAME_HUB", enabled: true, gameId: { in: gameIds.slice(0, 20) } },
    select: { id: true, game: { select: { name: true } } },
  });
  const banned = new Set(
    (await prisma.communityBan.findMany({ where: { userId, communityId: { in: hubs.map((h) => h.id) } }, select: { communityId: true } })).map(
      (b) => b.communityId
    )
  );
  const allowed = hubs.filter((h) => !banned.has(h.id));
  await prisma.communityMember.createMany({ data: allowed.map((h) => ({ communityId: h.id, userId })), skipDuplicates: true });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { favoriteGames: true } });
  const games = [...new Set([...(user?.favoriteGames ?? []), ...allowed.map((h) => h.game!.name)])].slice(0, 12);
  await prisma.user.update({ where: { id: userId }, data: { favoriteGames: games } });
  return allowed.length;
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

export type CommunityInput = {
  category?: unknown;
  name?: unknown;
  slug?: unknown;
  description?: unknown;
  tag?: unknown;
  gameId?: unknown;
  region?: unknown;
  joinPolicy?: unknown;
  rules?: unknown;
  applicationQuestion?: unknown;
  iconUrl?: unknown;
  bannerUrl?: unknown;
};

type FieldError = { field: keyof CommunityInput; message: string };

export class CommunityInputError extends Error {
  constructor(public field: keyof CommunityInput, message: string) {
    super(message);
    this.name = "CommunityInputError";
  }
}

const JOIN_POLICIES: CommunityJoinPolicy[] = ["OPEN", "APPLY", "INVITE"];

/** Uploaded images are site-relative /api/images/… paths; pasted ones must be https. */
function imageUrl(raw: unknown, field: keyof CommunityInput): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > 500 || !(raw.startsWith("/api/images/") || raw.startsWith("https://"))) {
    throw new CommunityInputError(field, "That image couldn't be used.");
  }
  return raw;
}

/**
 * Validates the editable fields present in `input`. Creating (not
 * partial) requires the safeguards: category, description, rules and an
 * icon; editing can't blank those out either (`requireSafeguards`).
 */
async function parseCommunityInput(input: CommunityInput, { partial, requireSafeguards = true, selfId }: { partial: boolean; requireSafeguards?: boolean; selfId?: string }) {
  const data: Prisma.CommunityUncheckedUpdateInput = {};
  const fail = (e: FieldError): never => {
    throw new CommunityInputError(e.field, e.message);
  };
  const required = (field: keyof CommunityInput) => requireSafeguards && (!partial || input[field] !== undefined);

  if (!partial || input.name !== undefined) {
    const name = typeof input.name === "string" ? validateCommunityName(input.name) : null;
    if (!name) fail({ field: "name", message: "Name must be 3–40 characters." });
    // Names are unique (ignoring case) so nobody can pass as another community.
    const clash = await prisma.community.findFirst({
      where: { name: { equals: name!, mode: "insensitive" }, NOT: selfId ? { id: selfId } : undefined, kind: { not: "TOURNAMENT" } },
      select: { id: true },
    });
    if (clash) fail({ field: "name", message: "A community with that name already exists." });
    data.name = name;
  }
  if (!partial || input.category !== undefined) {
    if (!isCommunityCategory(input.category)) fail({ field: "category", message: "Pick a category." });
    data.category = input.category as CommunityCategoryValue;
  }
  if (input.description !== undefined || required("description")) {
    const r = optionalText(input.description, COMMUNITY_DESCRIPTION_MAX);
    if (!r.ok) fail({ field: "description", message: `Keep the description under ${COMMUNITY_DESCRIPTION_MAX} characters.` });
    else if (!r.value && required("description")) fail({ field: "description", message: "Say what the community is about." });
    else data.description = r.value;
  }
  if (input.tag !== undefined) {
    const r = typeof input.tag === "string" ? validateTag(input.tag) : { ok: false as const };
    if (!r.ok) fail({ field: "tag", message: "Tags are 2–5 letters or numbers." });
    else data.tag = r.tag;
  }
  if (input.gameId !== undefined) {
    if (input.gameId === null || input.gameId === "") data.gameId = null;
    else {
      const game = typeof input.gameId === "string" ? await prisma.game.findFirst({ where: { id: input.gameId, enabled: true, publishedAt: { not: null } } }) : null;
      if (!game) fail({ field: "gameId", message: "Pick a game from the list." });
      data.gameId = game!.id;
    }
  }
  if (input.region !== undefined) {
    const r = optionalText(input.region, 60);
    if (!r.ok) fail({ field: "region", message: "Keep the location short." });
    else data.region = r.value;
  }
  if (!partial || input.joinPolicy !== undefined) {
    const policy = (input.joinPolicy ?? "OPEN") as CommunityJoinPolicy;
    if (!JOIN_POLICIES.includes(policy)) fail({ field: "joinPolicy", message: "Choose who can join." });
    data.joinPolicy = policy;
  }
  if (input.rules !== undefined || required("rules")) {
    const r = optionalText(input.rules, COMMUNITY_RULES_MAX);
    if (!r.ok) fail({ field: "rules", message: `Keep the rules under ${COMMUNITY_RULES_MAX} characters.` });
    else if (!r.value && required("rules")) fail({ field: "rules", message: "Every community needs rules — even a few lines." });
    else data.rules = r.value;
  }
  if (input.applicationQuestion !== undefined) {
    const r = optionalText(input.applicationQuestion, APPLICATION_QUESTION_MAX);
    if (!r.ok) fail({ field: "applicationQuestion", message: `Keep the question under ${APPLICATION_QUESTION_MAX} characters.` });
    else data.applicationQuestion = r.value;
  }
  if (input.iconUrl !== undefined || required("iconUrl")) {
    data.iconUrl = imageUrl(input.iconUrl, "iconUrl");
    if (!data.iconUrl && required("iconUrl")) fail({ field: "iconUrl", message: "Add an icon so people recognise your community." });
  }
  if (input.bannerUrl !== undefined) data.bannerUrl = imageUrl(input.bannerUrl, "bannerUrl");
  return data;
}

/** A player creates a community; they become its owner and first member.
 *  Needs a verified email (staff exempt). */
export async function createCommunity(owner: { id: string; isSuspended: boolean; isStaff: boolean; emailVerifiedAt: Date | null }, input: CommunityInput) {
  if (owner.isSuspended) throw new CommunityError("FORBIDDEN", "Suspended accounts can't create communities.");
  if (!owner.emailVerifiedAt && !owner.isStaff) throw new CommunityError("NOT_VERIFIED", "Verify your email before creating a community.");
  const owned = await prisma.community.count({ where: { ownerId: owner.id, kind: "PLAYER", enabled: true } });
  if (owned >= MAX_OWNED_COMMUNITIES) {
    throw new CommunityError("LIMIT_REACHED", `You can own up to ${MAX_OWNED_COMMUNITIES} communities.`);
  }

  const data = await parseCommunityInput(input, { partial: false });
  const requested = typeof input.slug === "string" && input.slug.trim() ? input.slug : slugify(String(data.name));
  const slug = validateSlug(requested);
  if (!slug) throw new CommunityInputError("slug", SLUG_RULES_MESSAGE);

  try {
    return await prisma.$transaction(async (tx) => {
      const community = await tx.community.create({
        data: { ...(data as Prisma.CommunityUncheckedCreateInput), kind: "PLAYER", slug, ownerId: owner.id, lastActivityAt: new Date() },
      });
      await tx.channel.createMany({ data: channelRows(community.id, COMMUNITY_CHANNELS) });
      await tx.communityMember.create({ data: { communityId: community.id, userId: owner.id, role: "OWNER" } });
      return community;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new CommunityInputError("slug", "That link is taken — try another.");
    }
    throw err;
  }
}

/** Settings edit. Game hubs keep their name/game (staff edit the game). */
export async function updateCommunity(communityId: string, input: CommunityInput) {
  const community = await prisma.community.findUnique({ where: { id: communityId } });
  if (!community || community.kind === "TOURNAMENT") throw new CommunityError("NOT_FOUND", "Community not found.");
  // Official communities predate the safeguards and are staff-run.
  const data = await parseCommunityInput(input, { partial: true, requireSafeguards: community.kind === "PLAYER", selfId: communityId });
  if (community.kind === "OFFICIAL") {
    delete data.gameId;
    delete data.joinPolicy;
    if (data.category && data.category !== "LOCATION" && data.category !== "INTEREST") delete data.category;
  } else if (community.kind !== "PLAYER") {
    delete data.name;
    delete data.gameId;
    delete data.joinPolicy;
  }
  return prisma.community.update({ where: { id: communityId }, data });
}

/** Communities a user may host tournaments for: player communities and
 *  game hubs they own or moderate (staff: every game hub too). */
export async function hostableCommunities(user: { id: string; isStaff: boolean }) {
  return prisma.community.findMany({
    where: {
      enabled: true,
      kind: { in: ["PLAYER", "GAME_HUB", "OFFICIAL"] },
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id, role: { in: ["OWNER", "MODERATOR"] } } } },
        ...(user.isStaff ? [{ kind: { in: ["GAME_HUB" as const, "OFFICIAL" as const] } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true },
  });
}
