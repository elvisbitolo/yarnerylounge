-- Threaded replies were added to the Prisma model without a matching database
-- migration, so every untrimmed PostComment read failed with
-- "The column PostComment.parentId does not exist in the current database".
-- The dashboard and admin analytics worked around it by selecting only
-- authorId and postId, which is why the admin page silently reported zeros
-- before that workaround landed.
ALTER TABLE "PostComment" ADD COLUMN "parentId" TEXT;

CREATE INDEX "PostComment_parentId_idx" ON "PostComment"("parentId");

ALTER TABLE "PostComment"
  ADD CONSTRAINT "PostComment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "PostComment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
