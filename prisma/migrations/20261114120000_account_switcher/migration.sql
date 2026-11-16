-- Account switcher: group child accounts under the owner that created them,
-- and mark the saved sessions that owner is allowed to switch to.
--
-- ownerId is null for an account that owns itself (the two allowlisted owners
-- and every pre-existing account). A child account created through the admin
-- "Add member" flow points at its creator.
--
-- Session.switchOwnerId is the root owner of the switch group. It is scoped
-- server-side so one owner can never switch into another owner's saved
-- sessions, even in a shared browser.
ALTER TABLE "User" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Session" ADD COLUMN "switchOwnerId" TEXT;

CREATE INDEX "User_ownerId_idx" ON "User"("ownerId");
CREATE INDEX "Session_switchOwnerId_idx" ON "Session"("switchOwnerId");

ALTER TABLE "User" ADD CONSTRAINT "User_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
