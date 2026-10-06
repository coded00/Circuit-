-- SEO foundations: a public address and full name for each game, and a country on each tournament.
ALTER TABLE "Game" ADD COLUMN "slug" TEXT, ADD COLUMN "seoName" TEXT, ADD COLUMN "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

ALTER TABLE "Tournament" ADD COLUMN "country" TEXT;
CREATE INDEX "Tournament_country_idx" ON "Tournament"("country");

-- Existing tournaments take their organizer's country.
UPDATE "Tournament" t SET "country" = u."country" FROM "User" u WHERE u."id" = t."organizerId" AND u."country" IS NOT NULL;

-- The one game whose name is an abbreviation people never search for.
UPDATE "Game" SET "slug" = 'call-of-duty-mobile', "seoName" = 'Call of Duty: Mobile', "aliases" = ARRAY['CODM']
  WHERE lower("name") = 'codm' AND "slug" IS NULL;
