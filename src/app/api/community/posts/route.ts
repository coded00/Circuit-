/**
 * Circuit — community feed (Global tab). Public read, auth-required
 * write. Friends/Teams tabs are UI-only "coming soon" (src/app/community/
 * page.tsx) — no follow-graph or team model exists, and building either
 * was never part of this rebuild's scope.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseCommunityPostContent } from "@/lib/validation";

const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take")) || DEFAULT_TAKE));

  const rows = await prisma.communityPost.findMany({
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
