-- Absolute instants for scheduling, plus the IANA zone needed to interpret them.
--
-- Background: every timestamp column in this schema was `timestamp without time
-- zone`. Prisma reads a naive value as UTC, then the app rendered it with
-- toLocaleString() in the server's local zone. A member in Nairobi (UTC+3) who
-- typed 11:00 therefore saw "2:00 PM". The write path was already correct: the
-- availability form parses its date+time input in the browser's own zone and
-- submits an absolute ISO string, so only the stored representation was wrong.
--
-- Two changes:
--   1. User.timezone + Availability.timeZone record the IANA zone a wall-clock
--      value belongs to.
--   2. Availability.startAt/endAt and Event.startTime/endTime become timestamptz,
--      so the value is an instant rather than an ambiguous wall clock.
--
-- BACKFILL ASSUMPTION (verified with the site owner before applying):
--   All 8 pre-existing Availability rows were authored in Africa/Nairobi by
--   Secret Yarnery (7) and the owner (1). The Event table was empty, so no event
--   rows are shifted. Raw pre-migration values are preserved in
--   availability-pre-timestamptz-backup.json.
--
--   The conversion uses each row's own pinned "timeZone" rather than a blanket
--   shift, so it stays correct for any row whose author is in a different zone
--   (including one that observes DST). A row with an unknown zone is left at its
--   original wall clock instead of being shifted by a guessed offset.
--
--   If further rows ever appear from an author whose zone is unknown, resolve
--   their timeZone first and re-apply, rather than guessing.

-- 1. Zone columns -------------------------------------------------------

ALTER TABLE "User"
  ADD COLUMN "timezone" TEXT;

COMMENT ON COLUMN "User"."timezone" IS
  'IANA zone, e.g. Africa/Nairobi. NULL means unknown: render in the viewer''s zone, never guess.';

-- Backfill only unambiguous country -> zone mappings. Everything else stays NULL
-- and is captured from the browser on next sign-in, which is the only way to
-- learn a member's zone without guessing.
UPDATE "User" SET "timezone" = CASE "country"
  WHEN 'Kenya'         THEN 'Africa/Nairobi'
  WHEN 'United Kingdom' THEN 'Europe/London'
  WHEN 'United States'  THEN 'America/New_York'
  WHEN 'Nigeria'       THEN 'Africa/Lagos'
  WHEN 'South Africa'  THEN 'Africa/Johannesburg'
  WHEN 'Ghana'         THEN 'Africa/Accra'
  WHEN 'Rwanda'        THEN 'Africa/Kigali'
  WHEN 'Uganda'        THEN 'Africa/Kampala'
  WHEN 'Tanzania'      THEN 'Africa/Dar_es_Salaam'
  WHEN 'India'         THEN 'Asia/Kolkata'
  WHEN 'Philippines'   THEN 'Asia/Manila'
  WHEN 'Canada'        THEN 'America/Toronto'
  WHEN 'Australia'     THEN 'Australia/Sydney'
  ELSE NULL
END
WHERE "country" IS NOT NULL;

-- The two accounts confirmed to be in Nairobi, independent of their country field.
UPDATE "User" SET "timezone" = 'Africa/Nairobi'
WHERE "email" IN ('secretyarnery@gmail.com', 'elvisbitolo8@gmail.com');

ALTER TABLE "Availability"
  ADD COLUMN "timeZone" TEXT;

COMMENT ON COLUMN "Availability"."timeZone" IS
  'IANA zone that a recurring row''s startAt/endAt wall clock belongs to. Pins "every Tuesday 11:00" to local 11:00 across DST.';

-- 2. Naive -> instant ----------------------------------------------------

-- Pin each row's zone BEFORE the retype, while the values are still readable as
-- wall clocks. Recurring rows keep their local meaning, so they must always
-- carry a zone; one-off rows are absolute after the shift and inherit the
-- author's zone when we know it.
UPDATE "Availability" SET "timeZone" = 'Africa/Nairobi'
WHERE "recurring" IS NOT NULL AND "recurring" <> 'none';

UPDATE "Availability" a
SET "timeZone" = u."timezone"
FROM "User" u
WHERE u.id = a."userId" AND a."timeZone" IS NULL;

-- Single statement: interprets each naive value as a wall clock in that row's
-- own pinned zone and stores the resulting instant. Retyping without
-- AT TIME ZONE would read the value as UTC and preserve the original 3-hour
-- error; hardcoding 'Africa/Nairobi' would misread any future non-Kenyan row.
-- A row with no known zone falls back to UTC, which preserves the value
-- unchanged rather than guessing an offset.
ALTER TABLE "Availability"
  ALTER COLUMN "startAt" TYPE timestamptz(3)
    USING "startAt" AT TIME ZONE COALESCE("timeZone", 'UTC'),
  ALTER COLUMN "endAt"   TYPE timestamptz(3)
    USING "endAt"   AT TIME ZONE COALESCE("timeZone", 'UTC');

-- The Event table was empty at migration time, so there is nothing to shift and
-- no per-author assumption to make. Both columns keep the session's UTC reading
-- of their existing values, which is correct for a no-op.
ALTER TABLE "Event"
  ALTER COLUMN "startTime" TYPE timestamptz(3) USING "startTime"::timestamptz,
  ALTER COLUMN "endTime"   TYPE timestamptz(3) USING "endTime"::timestamptz;

-- Refresh planner statistics: the retype changes column types, and the
-- Availability window queries filter on these columns.
ANALYZE "Availability";
ANALYZE "Event";
