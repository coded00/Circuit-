#!/bin/sh
set -e

echo "[Circuit Entrypoint] Booting container..."

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
