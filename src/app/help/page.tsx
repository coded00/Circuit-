import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, LifeBuoy } from "lucide-react";
import { supportUrl } from "@/lib/support";

export const metadata: Metadata = {
  title: "Help — Circuit",
  description: "How tournaments, entry fees, match results, disputes and prizes work on Circuit.",
};

type Faq = { q: string; a: React.ReactNode };
type Group = { title: string; items: Faq[] };

const GROUPS: Group[] = [
  {
    title: "Getting started",
    items: [
      { q: "How old do I need to be?", a: "You can join Circuit and play free tournaments from age 13. Paid entry and prize payouts are for players 18 and over." },
      { q: "How do I enter a tournament?", a: "Open the tournament from Compete and press Register. Check the rules and the entry fee, then confirm. Free tournaments confirm straight away." },
      { q: "How do I verify my email?", a: "Open Account settings and send yourself a verification link. It's valid for 24 hours." },
    ],
  },
  {
    title: "Entry fees and refunds",
    items: [
      { q: "How do I pay an entry fee?", a: "Pay by card, or from your Circuit wallet balance. Your entry is confirmed once the payment goes through." },
      { q: "Can I get my entry fee back?", a: "If an organizer cancels a paid tournament, every entry fee is refunded. Each tournament page also lists its own refund conditions before you pay." },
      { q: "Where does a refund go?", a: "Back to the way you paid: a wallet payment returns to your wallet, a card payment to your card." },
    ],
  },
  {
    title: "Playing a match",
    items: [
      { q: "What is the match code?", a: "Each match has one code, shown to both players. It must appear in the screenshot you upload as proof, so the proof is tied to that exact match." },
      { q: "How do I report a result?", a: "Open your match, submit the result and upload your proof. Your opponent then confirms it or disputes it." },
      { q: "What if my opponent doesn't respond?", a: "If one side reports and the other stays silent, the reported result is accepted automatically when the response window ends." },
    ],
  },
  {
    title: "Disputes",
    items: [
      { q: "What happens if we disagree on a result?", a: "Either player can dispute it. Both sides' reports and proof are reviewed. The organizer rules first; if they don't in time, or you escalate, Circuit staff decide." },
      { q: "Can I appeal a suspension?", a: "Yes. Account and community suspensions can be appealed, and the appeal is reviewed by Circuit staff." },
    ],
  },
  {
    title: "Prizes and payouts",
    items: [
      { q: "How do I get my prize?", a: "When a tournament finishes, winners claim their prize from the tournament page. Prizes are paid to the bank account linked in your account settings, so link one before you need it." },
      { q: "Why can't I claim a prize or pay an entry fee?", a: "Real-money actions need you to be 18 or over, and a prize needs a linked bank account." },
    ],
  },
];

export default function HelpPage() {
  const contact = supportUrl();
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-5 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] bg-accent-volt text-accent-volt-foreground">
          <LifeBuoy size={22} aria-hidden />
        </span>
        <h1 className="font-display text-4xl leading-none font-bold tracking-tight uppercase">Help</h1>
        <p className="text-muted">How Circuit works. If you still need a hand, reach out below.</p>
      </header>

      {GROUPS.map((g) => (
        <section key={g.title} className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold tracking-tight uppercase">{g.title}</h2>
          <div className="card divide-y divide-border overflow-hidden p-0">
            {g.items.map((item) => (
              <details key={item.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-semibold transition hover:bg-surface-elevated [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown size={18} className="shrink-0 text-muted transition-transform duration-[var(--duration-base)] group-open:rotate-180" aria-hidden />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="card flex flex-col items-start gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight uppercase">Still stuck?</h2>
        <p className="text-sm text-muted">
          {contact
            ? "Message the Circuit team and tell us the tournament or match you're asking about."
            : "For a dispute, open the match and use Dispute. For anything about your account, start in Account settings."}
        </p>
        {contact ? (
          <a href={contact} target={contact.startsWith("https") ? "_blank" : undefined} rel="noreferrer" className="btn-primary">
            Contact support
          </a>
        ) : (
          <Link href="/account" className="btn-secondary">
            Account settings
          </Link>
        )}
      </section>

      <p className="text-xs text-muted-strong">
        See the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}
