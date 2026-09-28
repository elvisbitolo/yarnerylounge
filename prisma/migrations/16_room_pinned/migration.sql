-- Leads the nav's "live now" banner. Without it the banner promotes whichever
-- room happens to be the most recently created, so adding an unrelated room
-- silently steals the banner from the one you want promoted.
--
-- Defaults to false for all existing rows, so this changes no current behaviour
-- until a room is explicitly pinned.
ALTER TABLE "Room" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
