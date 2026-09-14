/**
 * Circuit — Friends. Real `Friendship` rows (see that model's schema
 * comment) — incoming requests, requests you've sent, and your accepted
 * friends list. This is also what powers the Friends tabs on the
 * community feed, ladder, and homepage leaderboard (`src/lib/friends.ts`).
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AddFriendForm } from "@/components/friends/AddFriendForm";
import { FriendRequestRow } from "@/components/friends/FriendRequestRow";

export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/friends");
  }

  const [incoming, outgoing, accepted] = await Promise.all([
    prisma.friendship.findMany({
      where: { addresseeId: user.id, accepted: false },
      orderBy: { createdAt: "desc" },
      include: { requester: { select: { handle: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.friendship.findMany({
      where: { requesterId: user.id, accepted: false },
      orderBy: { createdAt: "desc" },
      include: { addressee: { select: { handle: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.friendship.findMany({
      where: { accepted: true, OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
      orderBy: { createdAt: "desc" },
      include: {
        requester: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
        addressee: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Friends</h1>
        <p className="text-sm text-muted">Add a player by handle, and manage requests.</p>
      </div>

      <div className="card">
        <AddFriendForm />
      </div>

      {incoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-section-heading">Requests ({incoming.length})</h2>
          <div className="flex flex-col gap-2">
            {incoming.map((f) => (
              <FriendRequestRow key={f.id} friendshipId={f.id} person={f.requester} kind="incoming" />
            ))}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-section-heading">Sent ({outgoing.length})</h2>
          <div className="flex flex-col gap-2">
            {outgoing.map((f) => (
              <FriendRequestRow key={f.id} friendshipId={f.id} person={f.addressee} kind="outgoing" />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-section-heading">Friends ({accepted.length})</h2>
        {accepted.length === 0 ? (
          <p className="card text-center text-muted">No friends yet — send a request above, or add one from their profile.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {accepted.map((f) => {
              const person = f.requesterId === user.id ? f.addressee : f.requester;
              return <FriendRequestRow key={f.id} friendshipId={f.id} person={person} kind="friend" />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
