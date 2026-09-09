/**
 * Circuit — Challenge detail page (Build Plan P4-1/P4-4/P4-6; user-facing
 * "Challenges" is this same underlying `Battle` feature, just renamed —
 * no schema/logic changes). The one other dark, "arena" environment
 * besides the homepage hero: a large Challenger/Opponent VS composition
 * (Volt vs Orange), real player avatars where set, and no card boxing
 * the info around it — plain text rows with real spacing instead, per
 * the refined visual system's "avoid unnecessary cards around the VS
 * composition... minimal interface chrome."
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Tv } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { StatusPill, battleStatusInfo } from "@/components/StatusPill";
import AcceptButton from "./AcceptButton";
import CancelBattleButton from "./CancelBattleButton";

type SidePlayer = { displayName: string; avatarUrl: string | null } | null;

function Side({
  label,
  player,
  fallbackName,
  accent,
}: {
  label: string;
  player: SidePlayer;
  fallbackName: string;
  accent: "volt" | "orange";
}) {
  const name = player?.displayName ?? fallbackName;
  const accentClass = accent === "volt" ? "text-accent-volt" : "text-accent-orange";
  const ringClass = accent === "volt" ? "border-accent-volt/40" : "border-accent-orange/40";
  return (
    <div className="flex flex-1 flex-col items-center gap-3 text-center">
      {player?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
        <img src={player.avatarUrl} alt="" className={`h-16 w-16 rounded-full border-2 object-cover ${ringClass}`} />
      ) : (
        <div className={`flex h-16 w-16 items-center justify-center rounded-full border-2 bg-surface text-xl font-semibold text-muted ${ringClass}`}>
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className={`text-eyebrow ${accentClass}`}>{label}</span>
        <span className="font-display text-xl font-bold tracking-tight sm:text-2xl">{name}</span>
      </div>
    </div>
  );
}

export default async function BattlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const battle = await prisma.battle.findUnique({
    where: { id },
    include: {
      creator: { select: { displayName: true, handle: true, avatarUrl: true } },
      targetUser: { select: { displayName: true, handle: true, avatarUrl: true } },
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
    <div data-surface="dark">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-8 px-6 py-14 text-center">
        <div className="flex flex-col items-center gap-3">
          <StatusPill tone={status.tone} pulse={status.pulse}>
            {status.label}
          </StatusPill>
          <span className="text-eyebrow">{battle.game}</span>
        </div>

        <div className="flex w-full items-center gap-6">
          <Side label="Challenger" player={battle.creator} fallbackName={battle.creator.displayName} accent="volt" />
          <span className="font-display text-lg font-bold text-muted">VS</span>
          <Side
            label={battle.targetUser ? "Opponent" : "Open Challenge"}
            player={battle.targetUser}
            fallbackName="Anyone"
            accent="orange"
          />
        </div>

        <div className="flex flex-col items-center gap-1.5 text-sm text-muted">
          <span>
            <span className="text-foreground">{battle.format === "BEST_OF_3" ? "Best of 3" : "Single match"}</span>
            {" · "}
            {battle.visibility === "TARGETED" ? "Targeted challenge" : "Open to anyone"}
            {" · "}
            <span className="text-foreground">Free</span> — no entry fee
          </span>
          <span className="text-xs">
            Opened by @{battle.creator.handle}
            {battle.targetUser && <> — challenging @{battle.targetUser.handle}</>}
          </span>
        </div>

        {battle.streamUrl && (
          <a href={battle.streamUrl} target="_blank" rel="noreferrer" className="btn-secondary w-fit">
            <Tv size={14} />
            Watch stream
          </a>
        )}

        {battle.status === "ACCEPTED" && battle.matches[0] && (
          <Link href={`/matches/${battle.matches[0].id}`} className="btn-primary w-fit">
            View match →
          </Link>
        )}
        {battle.status === "CANCELLED" && <p className="alert alert-danger">This Challenge was cancelled.</p>}
        <div className="flex flex-wrap justify-center gap-3">
          {isCreator && battle.status === "OPEN" && <CancelBattleButton battleId={battle.id} />}
          {canAccept && <AcceptButton battleId={battle.id} />}
        </div>
      </div>
    </div>
  );
}
