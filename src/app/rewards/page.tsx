import { Gift } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Circuit Rewards",
  description:
    "Earn rewards for competing on Circuit.",
  path: "/rewards",
  noindex: true,
});


export default function RewardsPage() {
  return (
    <ComingSoon
      title="Rewards"
      description="Earn and redeem rewards for playing on Circuit soon."
      icon={<Gift size={28} />}
    />
  );
}
