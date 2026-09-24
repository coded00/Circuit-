#!/bin/sh
set -e

echo "[Circuit Entrypoint] Booting container..."

# Run database migrations if DATABASE_URL is provided
if [ -n "$DATABASE_URL" ]; then
  echo "[Circuit Entrypoint] Running Prisma migrations (prisma migrate deploy)..."
  npx prisma migrate deploy || {
    echo "[Circuit Entrypoint] WARNING: Prisma migrations failed or database is not reachable yet."
  }
else
  echo "[Circuit Entrypoint] WARNING: DATABASE_URL is not set. Skipping migrations."
fi

echo "[Circuit Entrypoint] Starting Next.js application..."
exec "$@"
