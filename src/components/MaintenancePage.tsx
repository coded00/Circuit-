import { Wrench } from "lucide-react";

/**
 * Circuit — shown to non-staff visitors whenever `PlatformSetting.
 * maintenanceMode` is on (Settings > Platform Settings). Staff still see
 * the real app underneath so they can turn it back off.
 */
export function MaintenancePage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-volt-soft text-accent-volt">
        <Wrench size={24} />
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight">Circuit is down for maintenance</h1>
      <p className="max-w-sm text-sm text-muted">We&apos;ll be back shortly. Thanks for your patience.</p>
    </div>
  );
}
