-- Threaded replies: one level of nesting under each top-level comment.
-- Replies live on the same PostComment table via a self-relation.

ALTER TABLE "PostComment" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "PostComment_parentId_idx" ON "PostComment"("parentId");

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;