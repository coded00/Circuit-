import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import SiteHeader from "./SiteHeader";
import BottomTabBar from "./BottomTabBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
  const pathname = (await headers()).get("x-pathname") ?? "";
  const inDashboard = pathname.startsWith("/dashboard");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* data-zone on body itself, not just a nested wrapper — body's own
          background/color in globals.css resolve var(--background)/
          var(--foreground) at the body element, and plain inherited text
          (no explicit text-* utility) inherits body's computed color, so
          the zone override has to reach body directly or unstyled text
          and the base page background stay stuck on the marketing zone's
          light tokens even inside a dashboard-zone subtree. */}
      <body
        data-zone={inDashboard ? "dashboard" : undefined}
        className="min-h-full flex flex-col pb-14 sm:pb-0"
      >
        <SiteHeader />
        {children}
        <BottomTabBar />
      </body>
    </html>
  );
}
