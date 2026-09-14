import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getFriendIds } from "@/lib/friends";
import BattleForm from "./BattleForm";

export default async function NewBattlePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/battles/new");
  }
  const [games, friendIds] = await Promise.all([
    prisma.game.findMany({ where: { enabled: true }, orderBy: { name: "asc" } }),
    getFriendIds(user.id),
  ]);
  const friends = friendIds.length
    ? await prisma.user.findMany({ where: { id: { in: friendIds } }, select: { handle: true, displayName: true }, orderBy: { displayName: "asc" } })
    : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Open a Challenge</h1>
      <BattleForm games={games} friends={friends} />
    </div>
  );
}
