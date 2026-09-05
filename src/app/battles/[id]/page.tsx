/**
 * Circuit — Battle detail page (Build Plan P4-1/P4-4/P4-6).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import AcceptButton from "./AcceptButton";
import CancelBattleButton from "./CancelBattleButton";

export default async function BattlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const battle = await prisma.battle.findUnique({
    where: { id },
    include: {
      creator: { select: { displayName: true, handle: true } },
      targetUser: { select: { displayName: true, handle: true } },
      matches: { select: { id: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!battle) notFound();

  const user = await getCurrentUser();
  const isCreator = user !== null && user.id === battle.creatorId;
  const canAccept =
    user !== null &&
    !isCreator &&
    battle.status === "OPEN" &&
    (battle.visibility === "OPEN" || battle.targetUserId === user.id);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          {battle.status}
        </span>
        <h1 className="text-2xl font-semibold">{battle.game}</h1>
        <p className="text-zinc-500">
          {battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"} ·{" "}
          {battle.visibility === "TARGETED" ? "Targeted challenge" : "Open to anyone"}
        </p>
      </div>

      <p className="text-sm text-zinc-500">
        Opened by {battle.creator.displayName} (@{battle.creator.handle})
        {battle.targetUser && (
          <>
            {" "}
            — challenging {battle.targetUser.displayName} (@{battle.targetUser.handle})
          </>
        )}
      </p>

      {battle.status === "ACCEPTED" && battle.matches[0] && (
        <Link href={`/matches/${battle.matches[0].id}`} className="w-fit font-medium underline">
          View match
        </Link>
      )}
      {battle.status === "CANCELLED" && (
        <p className="text-sm text-zinc-500">This Battle was cancelled.</p>
      )}
      {isCreator && battle.status === "OPEN" && <CancelBattleButton battleId={battle.id} />}
      {canAccept && <AcceptButton battleId={battle.id} />}
    </div>
  );
}
