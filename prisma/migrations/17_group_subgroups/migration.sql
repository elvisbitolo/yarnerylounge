-- Add a one-level parent/child relationship for member-created crochet circles.
ALTER TABLE "Group" ADD COLUMN "parentGroupId" TEXT;

CREATE INDEX "Group_parentGroupId_idx" ON "Group"("parentGroupId");

ALTER TABLE "Group"
ADD CONSTRAINT "Group_parentGroupId_fkey"
FOREIGN KEY ("parentGroupId") REFERENCES "Group"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
