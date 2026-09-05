import { ShoppingBag } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function MarketplacePage() {
  return (
    <ComingSoon
      title="Marketplace"
      description="Buy, sell, and trade with other Circuit players soon."
      icon={<ShoppingBag size={28} />}
    />
  );
}
