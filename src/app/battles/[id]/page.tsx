/**
 * Circuit — Battle detail page (Build Plan P4-1/P4-4/P4-6).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Tv } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, battleStatusInfo } from "@/components/StatusPill";
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
  const status = battleStatusInfo(battle.status);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <StatusPill tone={status.tone} pulse={status.pulse}>
          {status.label}
        </StatusPill>
        <h1 className="text-2xl font-semibold">{battle.game}</h1>
        <p className="text-muted">
          {battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"} ·{" "}
          {battle.visibility === "TARGETED" ? "Targeted challenge" : "Open to anyone"}
        </p>
        {battle.streamUrl && (
          <a
            href={battle.streamUrl}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1.5 text-sm font-medium text-brand underline"
          >
            <Tv size={14} />
            Watch stream
          </a>
        )}
      </div>

      <div className="card text-sm text-muted">
        Opened by <span className="font-medium text-foreground">{battle.creator.displayName}</span> (@
        {battle.creator.handle})
        {battle.targetUser && (
          <>
            {" "}
            — challenging{" "}
            <span className="font-medium text-foreground">{battle.targetUser.displayName}</span> (@
            {battle.targetUser.handle})
          </>
        )}
      </div>

      {battle.status === "ACCEPTED" && battle.matches[0] && (
        <Link href={`/matches/${battle.matches[0].id}`} className="btn-primary w-fit">
          View match →
        </Link>
      )}
      {battle.status === "CANCELLED" && (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
          This Battle was cancelled.
        </p>
      )}
      {isCreator && battle.status === "OPEN" && <CancelBattleButton battleId={battle.id} />}
      {canAccept && <AcceptButton battleId={battle.id} />}
    </div>
  );
}
