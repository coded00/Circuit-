/**
 * Circuit — community feed. Global tab is real (any logged-in user posts,
 * everyone reads); Friends/Teams are shown but disabled — both need their
 * own relational model (a friend-graph, a team/clan system) that was
 * never scoped in this rebuild, same treatment as Wallet/Marketplace/
 * Rewards elsewhere.
 */

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
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

export default async function CommunityPage() {
  const [user, rows] = await Promise.all([
    getCurrentUser(),
    prisma.communityPost.findMany({
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      include: { author: { select: { displayName: true, handle: true, avatarUrl: true } } },
    }),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const posts = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? posts[posts.length - 1].id : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <Poller />
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Community</h1>

      <div className="flex gap-1 border-b border-border">
        <span className="border-b-2 border-brand px-3 py-2 text-sm font-medium">Global</span>
        <span className="px-3 py-2 text-sm text-muted" title="Coming soon">
          Friends
        </span>
        <span className="px-3 py-2 text-sm text-muted" title="Coming soon">
          Teams
        </span>
      </div>

      {user && <PostComposer />}

      {posts.length === 0 ? (
        <p className="card text-center text-muted">Nothing posted yet — be the first.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {posts.map((post) => (
            <div key={post.id} className="card-row flex gap-3 p-4">
              {post.author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs; next/image's domain allowlist doesn't fit V1 scope
                <img
                  src={post.author.avatarUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full border-2 border-brand/40 object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-brand/40 bg-surface text-sm font-semibold text-muted">
                  {post.author.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium">{post.author.displayName}</span>
                  <span className="shrink-0 text-xs text-muted">
                    @{post.author.handle} · {formatRelative(post.createdAt)}
                  </span>
                </div>
                <p className="text-sm break-words whitespace-pre-wrap">{post.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <LoadMorePosts initialCursor={nextCursor} />
    </div>
  );
}
