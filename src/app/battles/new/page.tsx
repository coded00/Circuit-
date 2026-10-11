import { redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getFriendIds } from "@/lib/friends";
import BattleForm from "./BattleForm";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Open a Challenge",
  description:
    "Create a 1v1 challenge on Circuit.",
  path: "/battles/new",
  noindex: true,
});


export default async function NewBattlePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath("/battles/new"));
  }
  const [games, friendIds] = await Promise.all([
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" } }),
    getFriendIds(user.id),
  ]);
  const friends = friendIds.length
    ? await prisma.user.findMany({ where: { id: { in: friendIds } }, select: { handle: true, displayName: true }, orderBy: { displayName: "asc" } })
    : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Open a Challenge</h1>
      <BattleForm games={games} friends={friends} />
    </div>
  );
}
