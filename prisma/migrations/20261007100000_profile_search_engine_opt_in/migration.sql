-- Players choose whether search engines may index their profile (default: no).
ALTER TABLE "User" ADD COLUMN "searchEngineIndexable" BOOLEAN NOT NULL DEFAULT false;
