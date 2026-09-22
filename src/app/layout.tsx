import type { Metadata } from "next";
import { Inter, Barlow_Condensed, Geist_Mono } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AppSidebar } from "@/components/nav/AppSidebar";
import { TopBar } from "@/components/nav/TopBar";
import { MobileTabBar } from "@/components/nav/MobileTabBar";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialogProvider } from "@/components/ConfirmDialogProvider";
import { OneSignalInit } from "@/components/OneSignalInit";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { QuickMatchIncomingListener } from "@/components/QuickMatchIncomingListener";
import { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION } from "@/lib/seo";

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

// metadataBase resolves every relative OG/Twitter image URL a page's own
// generateMetadata supplies (most do, via lib/seo.ts's absoluteUrl) — set
// once here so individual pages never need to repeat it.
//
// No title.template here on purpose: Next's title-template inheritance
// turned out to behave inconsistently between a static `export const
// metadata` (homepage) and a `generateMetadata()` function (tournament/
// battle pages) in this Next.js version — the suffix applied to one but
// not the other. buildMetadata() (lib/seo.ts) is the single source of
// truth instead: every page's title already includes " | Circuit" by the
// time it reaches here, so this default only covers the rare page with
// no metadata export of its own.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Circuit — Gaming Tournaments & Esports Competitions",
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

// Organization + WebSite — real, static facts about Circuit itself (not
// per-page), so this lives once at the root rather than repeated per
// page. No SearchAction: Circuit's search is a client-driven UI
// (SearchInput.tsx -> /api/search), not a real GET-query page a search
// engine could link a sitelinks searchbox to — adding one anyway would
// describe a capability that doesn't actually exist at that URL.
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/circuit-logo.png`,
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
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
      data-scroll-behavior="smooth"
      className={`${bodyFont.variable} ${displayFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning is scoped to this element's own attributes
          only (not its children) — needed because extensions like Grammarly
          inject data-gr-* attributes onto <body> before React hydrates,
          which otherwise logs a false-positive mismatch warning on every
          load for anyone with that extension installed. */}
      <body className="min-h-full" suppressHydrationWarning>
        {/* Real, static site-level facts only — see this file's own
            ORGANIZATION_JSON_LD/WEBSITE_JSON_LD comment on why no
            SearchAction. Per-page structured data (Event on tournament
            pages, etc.) lives on those pages themselves, not here. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }} />
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
        <ConfirmDialogProvider>
          <AppShell
            sidebar={<AppSidebar user={navUser} />}
            topBar={<TopBar user={user} disputeCount={disputeCount} />}
            mobileTabBar={<MobileTabBar user={navUser} />}
            maintenanceMode={platformSetting?.maintenanceMode ?? false}
            isStaffUser={user?.isStaff ?? false}
          >
            {children}
          </AppShell>
        </ConfirmDialogProvider>
        {user && <OneSignalInit userId={user.id} notifyNewContent={user.notifyNewContent} />}
        {user && <PresenceHeartbeat />}
        {user && <QuickMatchIncomingListener />}
      </body>
    </html>
  );
}
