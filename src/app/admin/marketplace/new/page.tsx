import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/ui";
import ListingForm from "@/components/marketplace/ListingForm";

export default async function AdminNewListingPage() {
  const games = await prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="New listing" back={{ href: "/admin/marketplace", label: "Marketplace" }} description="It goes live on the Marketplace as soon as you save." />
      <div className="max-w-2xl">
        <ListingForm games={games} admin />
      </div>
    </>
  );
}
