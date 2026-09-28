import { GameInfoForm } from "@/components/admin/catalog/GameInfoForm";
import { PageHeader, Panel } from "@/components/admin/ui";

/** Circuit — step one of the game builder: the game's own info. Modes and formats come next, on its builder page. */
export default function AdminNewGamePage() {
  return (
    <>
      <PageHeader back={{ href: "/admin/games", label: "Games" }} title="New game" description="It starts as a draft. You'll add modes and formats next, then publish it." />
      <Panel className="max-w-3xl">
        <GameInfoForm />
      </Panel>
    </>
  );
}
