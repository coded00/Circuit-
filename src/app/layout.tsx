import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AppSidebar } from "@/components/nav/AppSidebar";
import { TopBar } from "@/components/nav/TopBar";
import { MobileTabBar } from "@/components/nav/MobileTabBar";

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full pb-28 sm:pb-0">
        {/* Page shell — exactly two divs: the nav (20%) and everything
            else (80%), as its own explicit grid row rather than an
            implicit flex split. */}
        <div className="mx-auto grid min-h-full w-full max-w-7xl grid-cols-1 sm:grid-cols-[20%_80%]">
          <div>
            <AppSidebar user={navUser} disputeCount={disputeCount} />
          </div>
          <div className="flex min-w-0 flex-col">
            <TopBar user={user} />
            <main className="flex flex-1 flex-col">{children}</main>
          </div>
        </div>
        <MobileTabBar user={navUser} />
      </body>
    </html>
  );
}
