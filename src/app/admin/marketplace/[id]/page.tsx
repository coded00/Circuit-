import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { categoryLabel, formatListingPrice } from "@/lib/marketplace";
import { PageHeader, StatusBadge, type BadgeTone } from "@/components/admin/ui";
import ListingForm from "@/components/marketplace/ListingForm";
import { ManageListing } from "@/components/marketplace/ManageListing";

const STATUS_TONE: Record<string, BadgeTone> = { ACTIVE: "success", PAUSED: "attention", SOLD: "info", REMOVED: "neutral" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Live", PAUSED: "Paused", SOLD: "Sold", REMOVED: "Removed" };

export default async function AdminListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [listing, games] = await Promise.all([
    prisma.listing.findUnique({ where: { id }, include: { seller: { select: { displayName: true, handle: true } } } }),
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!listing) notFound();

  return (
    <>
      <PageHeader
        title={listing.title}
        back={{ href: "/admin/marketplace", label: "Marketplace" }}
        meta={
          <>
            <StatusBadge tone={STATUS_TONE[listing.status]} dot>
              {STATUS_LABEL[listing.status]}
            </StatusBadge>
            <span>
              {categoryLabel(listing.category)} · {formatListingPrice(listing.priceKobo)} · by {listing.seller.displayName}
            </span>
          </>
        }
        actions={
          listing.status === "ACTIVE" && (
            <Link href={`/marketplace/${listing.id}`} target="_blank" className="btn-secondary">
              <ExternalLink size={14} /> View on site
            </Link>
          )
        }
      />
      <div className="flex max-w-2xl flex-col gap-6">
        <ManageListing id={listing.id} status={listing.status} admin />
        <ListingForm
          games={games}
          admin
          listing={{ id: listing.id, category: listing.category, title: listing.title, description: listing.description, game: listing.game, priceKobo: listing.priceKobo, imageUrl: listing.imageUrl, stock: listing.stock, buyerPrompt: listing.buyerPrompt, featured: listing.featured, deliveryUrl: listing.deliveryUrl }}
        />
      </div>
    </>
  );
}
