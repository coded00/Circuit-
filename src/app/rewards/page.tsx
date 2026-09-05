import { Gift } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function RewardsPage() {
  return (
    <ComingSoon
      title="Rewards"
      description="Earn and redeem rewards for playing on Circuit soon."
      icon={<Gift size={28} />}
    />
  );
}
