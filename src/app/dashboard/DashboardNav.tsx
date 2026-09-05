"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Tournaments", icon: "🏆" },
  { href: "/dashboard/battles", label: "Battles", icon: "⚔️" },
  { href: "/dashboard/disputes", label: "Disputes", icon: "⚠️" },
  { href: "/dashboard/payouts", label: "Payouts", icon: "💰" },
] as const;

export function DashboardNav({
  disputeCount,
  orientation,
}: {
  disputeCount: number;
  orientation: "vertical" | "horizontal";
}) {
  const pathname = usePathname();

  return (
    <nav
      className={
        orientation === "vertical"
          ? "flex flex-col gap-1"
          : "flex gap-1 overflow-x-auto"
      }
    >
      {ITEMS.map((item) => {
        const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
            {item.href === "/dashboard/disputes" && disputeCount > 0 && (
              <span className="ml-auto rounded-full bg-status-cancelled/15 px-1.5 py-0.5 text-xs font-semibold text-status-cancelled">
                {disputeCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
