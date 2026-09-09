import type { Metadata } from "next";
import { Inter, Space_Grotesk, Geist_Mono } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AppSidebar } from "@/components/nav/AppSidebar";
import { TopBar } from "@/components/nav/TopBar";
import { MobileTabBar } from "@/components/nav/MobileTabBar";

// Phase 14: Inter for UI text, Space Grotesk for display/hero headlines.
const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Circuit",
  description: "Tournament and 1v1 Battle platform for Nigeria-first esports organizers.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const disputeCount = user
    ? await prisma.dispute.count({
        where: {
          status: { in: ["OPEN", "ORGANIZER_REVIEW"] },
          match: { tournament: { organizerId: user.id } },
        },
      })
    : 0;
  const navUser = user ? { handle: user.handle, isStaff: user.isStaff } : null;

  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full pb-28 sm:pb-0">
        {/* Phase 1: left nav + flexible main content. The persistent 330px
            right rail is homepage-specific composition (Phases 5/10-12 all
            describe homepage widgets), not a universal shell column — other
            pages (forms, dashboard, detail views) don't have right-rail
            content defined for them.
            Phase 16 (tablet): the sidebar narrows to a 72px icon-only rail
            between `sm` and `lg`, widening to the full 180px labeled rail
            at `lg`+ (a deliberate bit wider than Phase 2's own 170px
            figure) — AppSidebar itself switches its internal content
            (hides labels/promo card) to match at the same breakpoint. */}
        <div className="mx-auto grid min-h-full w-full max-w-[1920px] grid-cols-1 sm:grid-cols-[72px_1fr] lg:grid-cols-[180px_1fr]">
          <div>
            <AppSidebar user={navUser} disputeCount={disputeCount} />
          </div>
          <div className="flex min-w-0 flex-col">
            <TopBar user={user} />
            {/* TopBar is `fixed` (see its own comment for why), so it no
                longer reserves space in this flex column — this padding
                replaces that reserved space, matching the header's Phase-3
                spec height (~60px), so content starts right where the
                header visually ends instead of underneath it. */}
            <main className="flex flex-1 flex-col pt-[60px]">{children}</main>
          </div>
        </div>
        <MobileTabBar user={navUser} />
      </body>
    </html>
  );
}
