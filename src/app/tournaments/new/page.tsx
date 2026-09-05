import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import TournamentForm from "./TournamentForm";

export default async function NewTournamentPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/tournaments/new");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Create a tournament</h1>
        <p className="text-sm text-muted">
          One form, live in seconds — you&apos;ll get a shareable link before registration even opens.
        </p>
      </div>
      <div className="card">
        <TournamentForm />
      </div>
    </div>
  );
}
