-- Finding #11 of the security audit: unauthenticated, unthrottled work on public endpoints.
--
-- The second half of that finding. /api/search's five predicates all compile to `ILIKE '%q%'` — four of them
-- against the database, one against an in-memory game list — and a leading wildcard cannot be served by any
-- btree index, so each of the four was a sequential scan with a per-row lower() over tables that only grow.
-- On an endpoint with no auth and (until this change) no rate limit, that is the origin's CPU and I/O
-- available to anyone who can hold down a key.
--
-- Trigram GIN indexes serve exactly this shape of query, and need the pg_trgm extension. Created here rather
-- than declared in schema.prisma's datasource because the `postgresqlExtensions` preview feature is not
-- enabled and turning it on to add one extension is a larger change than the extension is worth; Prisma does
-- not track extensions it has not been told about, so the migration history stays the source of truth for it.
--
-- The indexes themselves *are* declared in schema.prisma (`ops: raw("gin_trgm_ops")`, `type: Gin`), which is
-- what keeps `prisma migrate diff` empty — a raw index Prisma did not know about would show up as drift and
-- be dropped by the next migration that regenerated this table.
--
-- Six indexes, one per searched column: Tournament.name and .game, Battle.game, User.displayName and
-- .handle, Community.name. The btrees already on some of those columns (Tournament's (game, status),
-- Battle's (game, status), User's unique handle) cannot serve a leading wildcard, so none of these is
-- redundant with one.
--
-- Write cost is real but these are the cold columns: name/game/displayName/handle are set at creation and
-- almost never updated, against four reads on a route anyone can call.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Battle_game_idx" ON "Battle" USING GIN ("game" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Community_name_idx" ON "Community" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Tournament_name_idx" ON "Tournament" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Tournament_game_idx" ON "Tournament" USING GIN ("game" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_displayName_idx" ON "User" USING GIN ("displayName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_handle_idx" ON "User" USING GIN ("handle" gin_trgm_ops);
