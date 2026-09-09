import { Radio } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

/**
 * Circuit — Watch/Live. Per the Phase 1 Nexus mapping: no streaming
 * backend exists (no broadcast capability, no viewer/follower tracking),
 * so this is a real route (same pattern as Wallet/Marketplace/Rewards),
 * not a fake live grid with invented numbers.
 */
export default function WatchPage() {
  return (
    <ComingSoon
      title="Watch"
      description="Live streams from tournament organizers and players will show up here once Circuit supports broadcasting."
      icon={<Radio size={28} />}
    />
  );
}
