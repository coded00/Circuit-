/**
 * Circuit — Vitest global setup. Loads `.env` for local runs; in CI the
 * real env vars (DATABASE_URL pointing at the ephemeral Postgres service,
 * JWT_SECRET, etc.) are already set by the workflow, and dotenv's
 * config() never overwrites an existing value, so this is a no-op there.
 */
import { config } from "dotenv";

config();
