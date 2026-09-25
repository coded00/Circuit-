import Link from "next/link";
import { GameInfoForm } from "@/components/admin/catalog/GameInfoForm";

/** Circuit — step one of the game builder: the game's own info. Modes and formats come next, on its builder page. */
export default function AdminNewGamePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/admin/games" className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← All games
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Create game</h1>
        <p className="text-sm text-muted">It starts as a draft. You&apos;ll add modes and formats next, then publish it.</p>
      </div>
      <div className="card max-w-3xl">
        <GameInfoForm />
      </div>
    </div>
  );
}
