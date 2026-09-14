/**
 * Circuit — community feed. Global tab is unfiltered; `?scope=friends`/
 * `?scope=teams` narrow to posts by the caller plus their accepted
 * friends or teammates (see `src/lib/friends.ts` / `src/lib/teams.ts`) —
 * re-derived from the session on every request rather than accepting an
 * id list from the client, so a friend/teammate list never has to
 * round-trip through a URL.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getFriendIds } from "@/lib/friends";
import { getTeammateIds } from "@/lib/teams";
import { parseCommunityPostContent } from "@/lib/validation";

const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take")) || DEFAULT_TAKE));
  const scope = searchParams.get("scope");

  let authorFilter: { authorId: { in: string[] } } | Record<string, never> = {};
  if (scope === "friends" || scope === "teams") {
    const user = await getCurrentUser();
    if (user) {
      const otherIds = scope === "friends" ? await getFriendIds(user.id) : await getTeammateIds(user.id);
      authorFilter = { authorId: { in: [user.id, ...otherIds] } };
    }
  }

  const rows = await prisma.communityPost.findMany({
    where: authorFilter,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { author: { select: { displayName: true, handle: true, avatarUrl: true } } },
  });

  const hasMore = rows.length > take;
  const posts = hasMore ? rows.slice(0, take) : rows;

  return NextResponse.json({
    posts,
    nextCursor: hasMore ? posts[posts.length - 1].id : null,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to post." }, { status: 401 });
  }
  if (user.isSuspended) {
    return NextResponse.json(
      { error: user.suspensionReason ?? "Your account is suspended." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseCommunityPostContent(body?.content);
  if (!parsed.ok) {
    return NextResponse.json({ error: "Post must be 1-500 characters." }, { status: 400 });
  }

  const post = await prisma.communityPost.create({
    data: { authorId: user.id, content: parsed.content },
  });

  return NextResponse.json({ id: post.id }, { status: 201 });
}
