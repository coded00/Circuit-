#!/bin/sh
set -e

echo "[Circuit Entrypoint] Booting container..."

# Refuse to run production with a missing, short or published secret: JWT_SECRET signs every
# session (anyone who knows it can sign in as any user, including an admin) and CRON_SECRET
# guards the scheduled sweep.
check_secret() {
  name="$1"; value="$2"; shift 2
  if [ -z "$value" ]; then
    echo "[Circuit Entrypoint] ERROR: $name is not set. Not starting the app." >&2; exit 1
  fi
  if [ "${#value}" -lt 32 ]; then
    echo "[Circuit Entrypoint] ERROR: $name is shorter than 32 characters. Generate one with: openssl rand -base64 48" >&2; exit 1
  fi
  for known in "$@"; do
    if [ "$value" = "$known" ]; then
      echo "[Circuit Entrypoint] ERROR: $name is a default value published in the repository. Set a random one. Not starting the app." >&2; exit 1
    fi
  done
}
if [ "$NODE_ENV" = "production" ]; then
  check_secret JWT_SECRET "$JWT_SECRET" "change_this_to_a_random_32_byte_secret" "change_me" "secret"
  # CRON_SECRET may legitimately be unset when an external scheduler is not used; if set it must be strong.
  if [ -n "$CRON_SECRET" ]; then
    check_secret CRON_SECRET "$CRON_SECRET" "circuit_cron_secret_vps"
  fi
fi

# Apply database migrations before the app starts. If they cannot be applied the
# container stops instead of serving an app whose code expects columns the database
# does not have yet (every query on those tables would fail).
if [ -n "$DATABASE_URL" ]; then
  # Prisma needs DIRECT_URL as well (schema.prisma's directUrl). Without a pooler in
  # between it is the same database, so fall back to DATABASE_URL.
  export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"

  attempt=1
  max_attempts=5
  until npx prisma migrate deploy; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[Circuit Entrypoint] ERROR: prisma migrate deploy failed $max_attempts times. Not starting the app." >&2
      exit 1
    fi
    echo "[Circuit Entrypoint] Migration attempt $attempt failed (database not ready?). Retrying in 5s..."
    attempt=$((attempt + 1))
    sleep 5
  done
else
  echo "[Circuit Entrypoint] WARNING: DATABASE_URL is not set. Skipping migrations."
fi

echo "[Circuit Entrypoint] Starting Next.js application..."
exec "$@"
