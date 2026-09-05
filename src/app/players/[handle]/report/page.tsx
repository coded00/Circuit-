import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import ReportForm from "./ReportForm";

export default async function ReportPlayerPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/players/${handle}/report`)}`);
  }

  const player = await prisma.user.findUnique({ where: { handle } });
  if (!player) notFound();

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Report @{player.handle}</h1>
      <ReportForm reportedHandle={player.handle} />
    </div>
  );
}
