-- Fix the referential direction of the Availability -> Event link.
--
-- Migration 11 declared:
--   ALTER TABLE "Availability" ADD CONSTRAINT ... FOREIGN KEY ("eventId")
--     REFERENCES "Event"("id") ON DELETE CASCADE
--
-- ON DELETE CASCADE on a foreign key applies to rows in the *referencing* table
-- (Availability), meaning "deleting an Event would delete the Availability". That
-- is the opposite of the intent, and it left the promoted Event orphaned when its
-- block was deleted: verified on the live database, deleting the Availability left
-- the Event row in place.
--
-- The correct behaviour is the reverse, and a foreign key cannot express it:
-- deleting a block must delete the event that was derived from it. That is a
-- parent-side action, so it belongs in application code, which is where
-- deleteAvailability now deletes the linked event explicitly.
--
-- RESTRICT here guards the other direction: an Event cannot be deleted while a
-- block still points at it, which prevents the same orphan from being created by
-- deleting the meetup and leaving the block claiming a nonexistent event.
--
-- Migrations 11 and 12 are left untouched; both are applied and their recorded
-- checksums must keep matching the files.

ALTER TABLE "Availability"
  DROP CONSTRAINT IF EXISTS "Availability_eventId_fkey";

ALTER TABLE "Availability"
  ADD CONSTRAINT "Availability_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ANALYZE "Availability";
