/**
 * Circuit — Observability & Error Monitoring (docs/circuit-stack.md).
 *
 * Provides a lightweight, reliable error logging and capture utility.
 * When SENTRY_DSN is configured in production, errors are forwarded
 * to Sentry without requiring heavy build-time SDK overhead.
 */

type ErrorContext = Record<string, unknown>;

export function captureException(error: unknown, context?: ErrorContext): void {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Format structured error for log aggregators (e.g., Vercel / Railway log drains)
  const logPayload = {
    level: "error",
    timestamp,
    message: errorMessage,
    stack: errorStack,
    ...context,
  };

  console.error(`[ERROR] ${errorMessage}`, JSON.stringify(logPayload, null, 2));

  // If SENTRY_DSN is configured in environment, dispatch to Sentry via HTTP store API
  const dsn = process.env.SENTRY_DSN;
  if (dsn && typeof fetch !== "undefined") {
    try {
      const url = new URL(dsn);
      const projectId = url.pathname.replace("/", "");
      const sentryHost = url.hostname;
      const publicKey = url.username;

      if (projectId && sentryHost && publicKey) {
        const storeEndpoint = `https://${sentryHost}/api/${projectId}/store/`;
        fetch(storeEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=circuit-observability/1.0, sentry_key=${publicKey}`,
          },
          body: JSON.stringify({
            event_id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
            timestamp,
            level: "error",
            platform: "javascript",
            message: errorMessage,
            extra: context,
            exception: {
              values: [
                {
                  type: error instanceof Error ? error.name : "Error",
                  value: errorMessage,
                  stacktrace: errorStack ? { frames: [] } : undefined,
                },
              ],
            },
          }),
        }).catch((sendErr) => {
          console.warn("[observability] Sentry ingest failed silently:", sendErr);
        });
      }
    } catch {
      // Sentry delivery failure should never crash the host application
    }
  }
}

export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: ErrorContext
): void {
  const logPayload = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...context,
  };

  if (level === "error") {
    console.error(`[${level.toUpperCase()}] ${message}`, JSON.stringify(logPayload));
  } else if (level === "warning") {
    console.warn(`[${level.toUpperCase()}] ${message}`, JSON.stringify(logPayload));
  } else {
    console.log(`[${level.toUpperCase()}] ${message}`, JSON.stringify(logPayload));
  }
}
