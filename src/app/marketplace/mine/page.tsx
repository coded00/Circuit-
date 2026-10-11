import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { loginPath } from "@/lib/safeRedirect";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { canSell } from "@/lib/marketplace";
import { categoryLabel, formatListingPrice } from "@/lib/marketplace";
import { ManageListing } from "@/components/marketplace/ManageListing";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "My Listings",
  description:
    "Your Circuit marketplace listings.",
  path: "/marketplace/mine",
  noindex: true,
});


const STATUS_LABEL = { ACTIVE: "Live", PAUSED: "Paused", SOLD: "Sold", REMOVED: "Removed" } as const;

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath("/marketplace/mine"));
  if (!canSell(user)) redirect("/marketplace");
  const listings = await prisma.listing.findMany({ where: { sellerId: user.id, status: { not: "REMOVED" } }, orderBy: { createdAt: "desc" } });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/marketplace" className="text-sm text-muted transition hover:text-foreground">
            ← Marketplace
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">My listings</h1>
        </div>
        <Link href="/marketplace/new" className="btn-primary">
          <Plus size={15} />
          Sell something
        </Link>
      </header>

      {listings.length === 0 ? (
        <div className="card state-block">
          <h2 className="state-title">You haven&apos;t listed anything</h2>
          <p className="state-description">Use Sell something to add the first one.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {listings.map((l) => (
            <li key={l.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/marketplace/${l.id}`} className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold">{l.title}</span>
                <span className="text-xs text-muted">
                  {categoryLabel(l.category)} · <span className="text-stat text-gold">{formatListingPrice(l.priceKobo)}</span> · {STATUS_LABEL[l.status]}
                </span>
              </Link>
              <ManageListing id={l.id} status={l.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
