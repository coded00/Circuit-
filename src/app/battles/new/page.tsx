import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import BattleForm from "./BattleForm";

export default async function NewBattlePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/battles/new");
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Open a Battle</h1>
      <BattleForm />
    </div>
  );
}
