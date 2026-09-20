/**
 * Circuit — boot-time environment validation (Next.js's `register()` hook,
 * runs once when the server starts, before any request is handled).
 *
 * Previously a missing JWT_SECRET or a malformed DATABASE_URL passed the
 * build silently and only surfaced as a confusing runtime crash on
 * whichever request happened to need it first (auth.ts's own JWT_SECRET
 * check, or Prisma's own DATABASE_URL error, both thrown lazily). This
 * fails loudly and immediately instead, at the one point that can't be
 * missed in a deploy's own startup logs.
 *
 * Deliberately NOT checking every optional integration var here
 * (PAYSTACK_SECRET_KEY, RESEND_API_KEY, R2_*, ONESIGNAL_API_KEY, ...) —
 * those already have an intentional, documented degrade path (see each
 * one's own comment in .env.example) and the app should keep booting
 * without them. Only what Circuit structurally cannot run at all
 * without belongs in this list.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Circuit can't start: missing required environment variable(s): ${missing.join(", ")}. ` +
        "Copy .env.example to .env and set real values before running the app."
    );
  }
}
