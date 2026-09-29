-- Replace the partial unique index from migration 11 with a plain unique index.
--
-- Postgres already treats NULLs as distinct in a unique index, so
-- `UNIQUE("eventId")` permits any number of unpromoted blocks on its own. The
-- `WHERE "eventId" IS NOT NULL` clause was therefore redundant, and it kept
-- Prisma from recognising eventId as a unique field, which the one-to-one
-- `Availability.event` relation requires.
--
-- Migration 11 is left untouched: it is already applied, and editing an applied
-- migration would make its recorded checksum disagree with the file.

DROP INDEX IF EXISTS "Availability_eventId_key";

CREATE UNIQUE INDEX "Availability_eventId_key" ON "Availability"("eventId");

-- Redundant now: the unique index already serves lookups by eventId, so the
-- extra non-unique index added alongside it would only cost write time.
DROP INDEX IF EXISTS "Availability_eventId_idx";

ANALYZE "Availability";
