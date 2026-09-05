import { Wallet } from "lucide-react";
import { ComingSoon } from "@/components/ComingSoon";

export default function WalletPage() {
  return (
    <ComingSoon
      title="Wallet"
      description="Manage your Circuit balance and payouts here soon."
      icon={<Wallet size={28} />}
    />
  );
}
