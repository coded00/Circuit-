import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { sized } from "@/lib/imageUrl";
import { ArenaGlow } from "@/components/ArenaBackdrop";
import { categoryLabel, formatListingPrice } from "@/lib/marketplace";
import { CategoryIcon } from "./categoryIcon";
import type { ListingCardData } from "./ListingCard";

type HeroListing = ListingCardData & { description: string };

/** The top of the Marketplace: the staff pick lit up big, with the next picks beside it. */
export function MarketHero({ picks, total }: { picks: HeroListing[]; total: number }) {
  const [main, ...rest] = picks;
  if (!main) {
    return (
      <section data-surface="dark" className="cut-lg relative overflow-hidden border border-border bg-black p-6 [--cut-line:var(--border)] sm:p-10">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_85%_20%,rgba(193,244,0,0.14),transparent)]" />
        <div className="relative flex max-w-xl flex-col gap-3">
          <span className="text-eyebrow text-accent-volt">Marketplace</span>
          <h2 className="font-display text-4xl leading-[0.95] font-bold tracking-tight text-white uppercase sm:text-5xl">Gear up for the next match</h2>
          <p className="text-sm text-white/70">Coaching, passes, merch and game top-ups, sold by Circuit and paid from your wallet.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
      <Link
        href={`/marketplace/${main.id}`}
        data-surface="dark"
        className="group cut-lg relative isolate flex min-h-[20rem] flex-col justify-end overflow-hidden border border-border bg-black p-5 text-white [--cut-line:var(--border)] sm:min-h-[24rem] sm:p-8"
      >
        {main.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- staff-uploaded or pasted image, arbitrary host and size
          <img src={sized(main.imageUrl, 900) ?? main.imageUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[var(--duration-reveal)] ease-[var(--ease-standard)] group-hover:scale-[1.04]" />
        ) : (
          <div aria-hidden className="absolute inset-0 -z-10 flex items-center justify-center bg-surface-elevated text-white/10">
            <CategoryIcon category={main.category} size={160} />
          </div>
        )}
        <ArenaGlow game={main.game ?? "Marketplace"} className="-z-10 opacity-40" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/95 via-black/75 to-black/25" />
        <span className="cut-xs absolute top-4 left-4 bg-accent-volt px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-accent-volt-foreground uppercase">Featured</span>
        <div className="flex max-w-xl flex-col gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-white/70 uppercase">
            <CategoryIcon category={main.category} size={12} />
            {categoryLabel(main.category)}
            {main.game ? ` · ${main.game}` : ""}
          </span>
          <h2 className="font-display text-3xl leading-[0.98] font-bold tracking-tight uppercase sm:text-5xl">{main.title}</h2>
          <p className="line-clamp-2 text-sm text-white/75">{main.description}</p>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <span className="text-stat text-2xl text-gold">{formatListingPrice(main.priceKobo)}</span>
            <span className="btn-primary pointer-events-none">
              Shop now <ArrowRight size={15} aria-hidden />
            </span>
          </div>
        </div>
      </Link>

      <div className="hidden flex-col gap-4 lg:flex">
        {rest.slice(0, 2).map((l) => (
          <Link
            key={l.id}
            href={`/marketplace/${l.id}`}
            className="group cut-lg flex flex-1 flex-col justify-end gap-1 overflow-hidden border border-border bg-surface-elevated p-4 transition [--cut-line:var(--border)] hover:border-border-hover"
            style={l.imageUrl ? { backgroundImage: `linear-gradient(to top, rgb(0 0 0 / 0.9), rgb(0 0 0 / 0.25)), url(${l.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            <span className="font-mono text-[10px] tracking-wide text-white/70 uppercase">{categoryLabel(l.category)}</span>
            <span className="line-clamp-2 font-display text-lg leading-[1.05] font-bold tracking-tight text-white uppercase">{l.title}</span>
            <span className="text-stat text-gold">{formatListingPrice(l.priceKobo)}</span>
          </Link>
        ))}
        {rest.length === 0 && (
          <div className="cut-lg flex flex-1 flex-col justify-center gap-1 border border-border bg-surface p-5 [--cut-line:var(--border)]">
            <span className="text-stat text-4xl">{total}</span>
            <span className="text-sm text-muted">things on sale right now</span>
          </div>
        )}
      </div>
    </section>
  );
}
