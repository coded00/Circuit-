import { Package, Sparkles, Store, Wrench } from "lucide-react";
import type { ListingCategory } from "@prisma/client";

const ICONS = { SERVICE: Wrench, DIGITAL: Sparkles, ITEM: Package, STORE: Store } as const;

export function CategoryIcon({ category, size = 16, className }: { category: ListingCategory; size?: number; className?: string }) {
  const Icon = ICONS[category];
  return <Icon size={size} className={className} aria-hidden />;
}
