import type { Metadata } from "next";
import { Inter, Barlow_Condensed, Geist_Mono } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AppSidebar } from "@/components/nav/AppSidebar";
import { TopBar } from "@/components/nav/TopBar";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { AppShell } from "@/components/AppShell";
import { OneSignalInit } from "@/components/OneSignalInit";

// Phase 14: Inter for UI text, Barlow Condensed ExtraBold for display/hero
// headlines — a tall, condensed weight suited to the CIRCUIT wordmark's
// own stencil-y energy.
const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "800",
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
  const [disputeCount, platformSetting] = await Promise.all([
    user
      ? prisma.dispute.count({
          where: {
            status: { in: ["OPEN", "ORGANIZER_REVIEW"] },
            match: { tournament: { organizerId: user.id } },
          },
        })
      : 0,
    prisma.platformSetting.findUnique({ where: { id: "singleton" } }),
  ]);
  const navUser = user ? { handle: user.handle, displayName: user.displayName, isStaff: user.isStaff } : null;

  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Phase 1: left nav + flexible main content. The persistent 330px
            right rail is homepage-specific composition (Phases 5/10-12 all
            describe homepage widgets), not a universal shell column — other
            pages (forms, dashboard, detail views) don't have right-rail
            content defined for them.
            Phase 16 (tablet): the sidebar narrows to a 72px icon-only rail
            between `sm` and `lg`, widening to the full 180px labeled rail
            at `lg`+ (a deliberate bit wider than Phase 2's own 170px
            figure) — AppSidebar itself switches its internal content
            (hides labels/promo card) to match at the same breakpoint.

            AppShell decides whether this shell renders at all — the four
            auth routes skip it entirely for their own full-bleed split
            layout (see AppShell.tsx / AuthSplitLayout.tsx). */}
        <AppShell
          sidebar={<AppSidebar user={navUser} />}
          topBar={<TopBar user={user} disputeCount={disputeCount} />}
          mobileTabBar={<MobileTabBar user={navUser} />}
          maintenanceMode={platformSetting?.maintenanceMode ?? false}
          isStaffUser={user?.isStaff ?? false}
        >
          {children}
        </AppShell>
        {user && <OneSignalInit userId={user.id} notifyNewContent={user.notifyNewContent} />}
      </body>
    </html>
  );
}
