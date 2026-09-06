"use client";

import { useState } from "react";

type Post = {
  id: string;
  content: string;
  createdAt: string;
  author: { displayName: string; handle: string; avatarUrl: string | null };
};

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelative(dateIso: string): string {
  const diffMin = Math.round((new Date(dateIso).getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour");
  return relativeTime.format(Math.round(diffHour / 24), "day");
}

function PostRow({ post }: { post: Post }) {
  return (
    <div className="card-row flex gap-3 p-4">
      {post.author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
        <img src={post.author.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border-2 border-brand/40 object-cover" />
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
  );
}

export default function LoadMorePosts({ initialCursor }: { initialCursor: string | null }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const res = await fetch(`/api/community/posts?cursor=${cursor}`);
    if (res.ok) {
      const data = await res.json();
      setPosts((prev) => [...prev, ...data.posts]);
      setCursor(data.nextCursor);
    }
    setLoading(false);
  }

  return (
    <>
      {posts.length > 0 && (
        <div className="flex flex-col gap-2">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </div>
      )}
      {cursor && (
        <button type="button" onClick={loadMore} disabled={loading} className="btn-secondary w-fit self-center">
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
