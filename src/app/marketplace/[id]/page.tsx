import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { blockedBetween } from "@/lib/blocks";
import { categoryLabel, formatListingPrice, relatedListings } from "@/lib/marketplace";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { CategoryIcon } from "@/components/marketplace/categoryIcon";
import { ManageListing } from "@/components/marketplace/ManageListing";
import { BuyPanel } from "@/components/marketplace/BuyPanel";
import { StickyBuyBar } from "@/components/marketplace/StickyBuyBar";
import { ListingRow } from "@/components/marketplace/ListingRow";
import { Wallet, PackageCheck, Download, Undo2 } from "lucide-react";

const STATUS_NOTE = { ACTIVE: null, PAUSED: "Paused: only you can see this listing.", SOLD: "Marked sold.", REMOVED: "Removed." } as const;

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, listing] = await Promise.all([
    getCurrentUser(),
    prisma.listing.findUnique({ where: { id }, include: { seller: { select: { id: true, handle: true, displayName: true, avatarUrl: true, isSuspended: true } } } }),
  ]);
  if (!listing) notFound();

  // A game listing that asks for the buyer's details usually wants their in-game name: offer the one they saved.
  let suggestedNote = "";
  if (user && listing.buyerPrompt && listing.game) {
    const game = await prisma.game.findFirst({ where: { name: { equals: listing.game, mode: "insensitive" } }, select: { id: true } });
    const saved = game ? await prisma.userGameName.findUnique({ where: { userId_gameId: { userId: user.id, gameId: game.id } }, select: { name: true } }) : null;
    suggestedNote = saved?.name ?? "";
  }

  const isOwner = user?.id === listing.sellerId;
  // Everyone else only sees a live listing from a seller they can reach.
  if (!isOwner) {
    if (listing.status !== "ACTIVE" || listing.seller.isSuspended) notFound();
    if (user && (await blockedBetween(user.id, listing.sellerId))) notFound();
  }

  const related = await relatedListings(user?.id ?? null, listing);
  const instant = !!listing.deliveryUrl;
  const soldOut = listing.stock === 0 || listing.status !== "ACTIVE";
  const steps = instant
    ? [
        { Icon: Wallet, title: "Pay from your wallet", body: "One tap, and you see your balance before you confirm." },
        { Icon: Download, title: "Download straight away", body: "The file starts downloading the moment you pay." },
        { Icon: PackageCheck, title: "Yours to keep", body: "It stays in My orders, so you can download it again." },
      ]
    : [
        { Icon: Wallet, title: "Pay from your wallet", body: "One tap, and you see your balance before you confirm." },
        { Icon: PackageCheck, title: "Circuit delivers it", body: "We prepare your order and send it to you. You get a notification." },
        { Icon: Undo2, title: "Refunded if we can't", body: "If we can't deliver, the money goes straight back to your wallet." },
      ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 pb-28 sm:px-8 sm:py-10 md:pb-10">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted">
        <Link href="/marketplace" className="flex items-center gap-1 transition hover:text-foreground">
          <ChevronLeft size={16} /> Marketplace
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/marketplace?category=${listing.category}`} className="transition hover:text-foreground">
          {categoryLabel(listing.category)}
        </Link>
      </nav>

      {isOwner && STATUS_NOTE[listing.status] && <p className="alert alert-info">{STATUS_NOTE[listing.status]}</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.25fr_1fr] md:items-start">
        <div className="cut-lg relative aspect-[4/3] w-full overflow-hidden bg-surface-elevated">
          {listing.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- seller-uploaded or pasted image, arbitrary host and size
            <img src={listing.imageUrl} alt="" className={`h-full w-full object-cover ${soldOut ? "opacity-60" : ""}`} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted/40">
              <CategoryIcon category={listing.category} size={88} />
            </div>
          )}
          {instant && (
            <span className="cut-xs absolute top-3 left-3 flex items-center gap-1 bg-accent-volt px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-accent-volt-foreground uppercase">
              <Download size={12} aria-hidden /> Instant download
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4 md:sticky md:top-6">
          <span className="cut-xs flex w-fit items-center gap-1 bg-surface-elevated px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide uppercase">
            <CategoryIcon category={listing.category} size={12} />
            {categoryLabel(listing.category)}
            {listing.game ? ` · ${listing.game}` : ""}
          </span>
          <h1 className="font-display text-3xl leading-[1.02] font-bold tracking-tight uppercase sm:text-4xl">{listing.title}</h1>
          <div className="flex items-baseline gap-3">
            <span className="text-stat text-3xl text-gold">{formatListingPrice(listing.priceKobo)}</span>
            {listing.stock !== null && listing.stock > 0 && listing.stock <= 5 && <span className="text-sm text-accent-orange">Only {listing.stock} left</span>}
          </div>

          <div className="flex items-center gap-3 text-sm text-muted">
            <PlayerAvatar person={listing.seller} size="sm" />
            <span>
              Sold and delivered by <span className="font-semibold text-foreground">Circuit</span>
            </span>
          </div>

          {isOwner || user?.isStaff ? (
            <div className="flex flex-col gap-3">
              {user?.isStaff && (
                <Link href={`/admin/marketplace/${listing.id}`} className="btn-secondary w-fit">
                  Manage in admin
                </Link>
              )}
              {isOwner && <ManageListing id={listing.id} status={listing.status} />}
            </div>
          ) : null}
          {!isOwner && (
            <BuyPanel
              listingId={listing.id}
              priceKobo={listing.priceKobo}
              buyerPrompt={listing.buyerPrompt}
              soldOut={soldOut}
              signedIn={!!user}
              walletBalance={user?.walletBalance ?? 0}
              instant={instant}
              suggestedNote={suggestedNote}
            />
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-8 md:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-2">
          <h2 className="text-eyebrow text-muted">About this listing</h2>
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{listing.description}</p>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-eyebrow text-muted">How it works</h2>
          <ol className="flex flex-col gap-3">
            {steps.map(({ Icon, title, body }, i) => (
              <li key={title} className="flex gap-3">
                <span className="cut-xs flex h-9 w-9 shrink-0 items-center justify-center bg-surface-elevated text-accent-volt">
                  <Icon size={16} aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">
                    {i + 1}. {title}
                  </span>
                  <span className="text-[13px] text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <ListingRow title="You might also like" listings={related} />

      {!isOwner && !soldOut && <StickyBuyBar title={listing.title} price={formatListingPrice(listing.priceKobo)} />}
    </div>
  );
}
