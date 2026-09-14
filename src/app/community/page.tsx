/**
 * Circuit — community feed. Global tab is real (any logged-in user posts,
 * everyone reads); Friends tab is now real too, filtered by `Friendship`
 * (see src/lib/friends.ts). Teams is still shown but disabled — no team
 * model exists yet, same treatment as Wallet/Marketplace/Rewards
 * elsewhere, until that's built.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getFriendIds } from "@/lib/friends";
import Poller from "@/app/Poller";
import PostComposer from "./PostComposer";
import LoadMorePosts from "./LoadMorePosts";

const PAGE_SIZE = 20;

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(date: Date): string {
  const diffMin = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour");
  return relativeTime.format(Math.round(diffHour / 24), "day");
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ feed?: string }>;
}) {
  const { feed } = await searchParams;
  const user = await getCurrentUser();
  const isFriendsFeed = feed === "friends" && !!user;

  const authorFilter = isFriendsFeed
    ? { authorId: { in: [user!.id, ...(await getFriendIds(user!.id))] } }
    : {};

  const rows = await prisma.communityPost.findMany({
    where: authorFilter,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    include: { author: { select: { displayName: true, handle: true, avatarUrl: true } } },
  });
  const hasMore = rows.length > PAGE_SIZE;
  const posts = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? posts[posts.length - 1].id : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <Poller />
      <h1 className="text-section-heading text-xl">Community</h1>

      <div className="tabs">
        <Link href="/community" className={`tab ${!isFriendsFeed ? "tab-active" : ""}`}>
          Global
        </Link>
        {user ? (
          <Link href="/community?feed=friends" className={`tab ${isFriendsFeed ? "tab-active" : ""}`}>
            Friends
          </Link>
        ) : (
          <span className="tab tab-disabled" title="Log in to see your friends' posts">
            Friends
          </span>
        )}
        <span className="tab tab-disabled" title="Coming soon">
          Teams
        </span>
      </div>

      {user && <PostComposer />}

      {posts.length === 0 ? (
        <p className="card text-center text-muted">
          {isFriendsFeed ? (
            <>
              Nothing from your friends yet — <Link href="/friends" className="font-medium text-accent-blue hover:underline">add some</Link>{" "}
              or check back later.
            </>
          ) : (
            "Nothing posted yet — be the first."
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.map((post) => (
            <div key={post.id} className="card-row flex gap-3 p-3">
              {post.author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs; next/image's domain allowlist doesn't fit V1 scope
                <img
                  src={post.author.avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated font-semibold text-muted">
                  {post.author.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-medium">{post.author.displayName}</span>
                  <span className="text-metadata">
                    @{post.author.handle} · {formatRelative(post.createdAt)}
                  </span>
                </div>
                <p className="text-sm break-words">{post.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <LoadMorePosts key={feed ?? "global"} initialCursor={nextCursor} scope={isFriendsFeed ? "friends" : undefined} />
    </div>
  );
}
