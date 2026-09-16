/**
 * Circuit — Organizer Dashboard content wrapper. The dashboard's own nav
 * (sidebar Organize section on desktop, sub-nav strip on mobile) now
 * lives in the app-wide AppSidebar/MobileTabBar (src/components/nav/) —
 * this layout only guards the route and provides the panel's padding.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

// Private, per-user organizer tooling — nothing under here is real public
// content, and every child page inherits this rather than repeating it.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">{children}</div>;
}
