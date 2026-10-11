/**
 * Circuit — the admin game builder: Game Information on one side, the
 * Game Modes → Formats tree on the other. Everything an organizer can
 * choose for this game, and every player/team rule a competition
 * inherits, is configured here.
 */

import { notFound } from "next/navigation";
import { loadGameTree } from "@/lib/gameCatalogQueries";
import { publishBlocker } from "@/lib/gameCatalog";
import { GameInfoForm } from "@/components/admin/catalog/GameInfoForm";
import { ModesBuilder } from "@/components/admin/catalog/ModesBuilder";
import { GameActions } from "@/components/admin/catalog/GameActions";
import { Avatar, PageHeader, Panel, Section, StatusBadge } from "@/components/admin/ui";

export default async function AdminGameBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await loadGameTree(id);
  if (!game) notFound();

  const status = !game.enabled
    ? { tone: "neutral" as const, label: "Inactive" }
    : game.publishedAt
      ? { tone: "success" as const, label: "Published" }
      : { tone: "attention" as const, label: "Draft" };

  return (
    <>
      <PageHeader
        back={{ href: "/admin/games", label: "Games" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={game.name} src={game.iconUrl ?? game.coverUrl} size={36} square />
            {game.name}
          </span>
        }
        meta={
          <>
            <StatusBadge tone={status.tone} dot={status.label === "Published"}>
              {status.label}
            </StatusBadge>
            <span>
              {game.modes.length} mode{game.modes.length === 1 ? "" : "s"} · {game.modes.reduce((n, m) => n + m.formats.length, 0)} formats
            </span>
          </>
        }
        actions={<GameActions game={{ id: game.id, name: game.name, enabled: game.enabled, published: !!game.publishedAt }} blocker={publishBlocker(game.modes)} />}
      />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Section title="Game information">
          <Panel>
            <GameInfoForm game={game} />
          </Panel>
        </Section>

        <Section title="Modes and formats" description="Each mode's formats set the players, teams and structures organizers can choose.">
          <ModesBuilder gameId={game.id} modes={game.modes} />
        </Section>
      </div>
    </>
  );
}
