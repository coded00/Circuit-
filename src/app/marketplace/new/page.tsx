import { redirect } from "next/navigation";
import { canSell } from "@/lib/marketplace";
import { loginPath } from "@/lib/safeRedirect";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import ListingForm from "@/components/marketplace/ListingForm";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "List an Item",
  description:
    "List an item on the Circuit marketplace.",
  path: "/marketplace/new",
  noindex: true,
});


export default async function NewListingPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath("/marketplace/new"));
  if (!canSell(user)) redirect("/marketplace");
  const games = await prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true } });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Sell something</h1>
        <p className="text-sm text-muted">Listings appear on the Marketplace for everyone, and buyers pay from their wallet.</p>
      </div>
      <ListingForm games={games} />
    </div>
  );
}
