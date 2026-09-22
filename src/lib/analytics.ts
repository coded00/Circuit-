/**
 * Circuit — Product Analytics & Lifecycle Events (PRD §17).
 *
 * Implements standard event tracking for Circuit's North Star metric
 * (match_completed_verified) and core product funnel.
 * Supports PostHog out-of-the-box when NEXT_PUBLIC_POSTHOG_KEY is configured.
 */

export type AnalyticsEvent =
  | "tournament_created"
  | "tournament_joined"
  | "payment_initiated"
  | "payment_verified"
  | "match_score_submitted"
  | "match_completed_verified"
  | "escrow_payout_released"
  | "wallet_withdrawn"
  | "quick_match_created"
  | "quick_match_accepted"
  | "quick_match_expired"
  | "quick_match_cancelled";

export interface EventProperties {
  userId?: string;
  tournamentId?: string;
  matchId?: string;
  amountMinor?: number;
  currency?: string;
  game?: string;
  [key: string]: unknown;
}

export function trackEvent(event: AnalyticsEvent, properties?: EventProperties): void {
  const timestamp = new Date().toISOString();

  // 1. Console log in non-production environments
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Analytics] ${event}`, properties ?? {});
  }

  // 2. PostHog client integration if available in window
  if (typeof window !== "undefined" && (window as unknown as { posthog?: { capture: (name: string, props?: unknown) => void } }).posthog) {
    try {
      (window as unknown as { posthog: { capture: (name: string, props?: unknown) => void } }).posthog.capture(event, properties);
      return;
    } catch {
      // Ignore analytics capture failure
    }
  }

  // 3. PostHog REST ingest from server or client fallback
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.POSTHOG_KEY;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

  if (posthogKey && typeof fetch !== "undefined") {
    fetch(`${posthogHost}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: posthogKey,
        event,
        properties: {
          distinct_id: properties?.userId || "anonymous",
          $current_url: typeof window !== "undefined" ? window.location.href : undefined,
          timestamp,
          ...properties,
        },
      }),
    }).catch(() => {
      // Fail silently
    });
  }
}
