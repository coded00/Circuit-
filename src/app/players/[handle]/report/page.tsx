import { notFound, redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
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
    redirect(loginPath(`/players/${handle}/report`));
  }

  const player = await prisma.user.findUnique({ where: { handle } });
  if (!player) notFound();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-section-heading text-xl">Report @{player.handle}</h1>
      <ReportForm reportedHandle={player.handle} />
    </div>
  );
}
