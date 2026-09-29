-- Link an availability block to the Event it produced, so a block and its
-- meetup are one and the same record rather than two copies that drift apart.
--
-- Background: /events rendered two independent sections, "Upcoming hangouts"
-- (Availability) and the events board (Event). Someone who added a block saw it
-- in one place and could not RSVP, get a room, or see capacity; the same slot
-- listed twice meant two places to keep in sync.
--
-- This adds the link. Availability.eventId points at the Event created from that
-- block (NULL for a block that has not been promoted), and Event.source records
-- that the Event came from a member's availability rather than from the admin
-- scheduler. Neither is destructive: existing rows keep NULL source and behave
-- exactly as before, so no backfill is needed.

ALTER TABLE "Availability"
  ADD COLUMN "eventId" TEXT;

ALTER TABLE "Event"
  ADD COLUMN "source" TEXT;

COMMENT ON COLUMN "Availability"."eventId" IS
  'The Event created from this block, or NULL while it is only an offer of time.';
COMMENT ON COLUMN "Event"."source" IS
  'NULL for admin-scheduled events; "availability" when promoted from a member''s block.';

-- A block maps to at most one event, so a second promotion cannot silently
-- produce a duplicate meetup for the same slot.
CREATE UNIQUE INDEX "Availability_eventId_key"
  ON "Availability"("eventId")
  WHERE "eventId" IS NOT NULL;

-- The events page filters out blocks that already have an event, and the
-- delete path cascades to the linked event. Both hit this column.
CREATE INDEX "Availability_eventId_idx" ON "Availability"("eventId");

-- ON DELETE CASCADE, not SET NULL: the event exists only because the block does.
-- Deleting the block must not leave an orphaned meetup that nobody can edit,
-- since the block is what the event's permissions and room are derived from.
ALTER TABLE "Availability"
  ADD CONSTRAINT "Availability_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial index for the events-page filter, so it does not scan the whole table.
CREATE INDEX "Event_source_idx" ON "Event"("source")
  WHERE "source" IS NOT NULL;

ANALYZE "Availability";
ANALYZE "Event";
