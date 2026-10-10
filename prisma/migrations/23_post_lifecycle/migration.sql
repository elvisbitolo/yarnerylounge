-- Post lifecycle: editing, trash/restore, moderator hide, comment locks,
-- sensitive-content flag, alt text, scheduling and content-level resharing.

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "deletedBy" TEXT;
ALTER TABLE "Post" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "hiddenBy" TEXT;
ALTER TABLE "Post" ADD COLUMN "hiddenReason" TEXT;
ALTER TABLE "Post" ADD COLUMN "lockedComments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "sensitive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Post" ADD COLUMN "altText" TEXT;
ALTER TABLE "Post" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "repostOfId" TEXT;
ALTER TABLE "Post" ADD COLUMN "quoteOfId" TEXT;

-- CreateIndex
CREATE INDEX "Post_deletedAt_idx" ON "Post"("deletedAt");
CREATE INDEX "Post_scheduledAt_idx" ON "Post"("scheduledAt");

-- AlterTable
ALTER TABLE "PostComment" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "PostComment" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "PostComment" ADD COLUMN "pinnedBy" TEXT;

-- CreateTable
CREATE TABLE "PostVersion" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "kind" TEXT,
    "editorId" TEXT,
    "editorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostSubscription" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostModerationLog" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostVersion_postId_createdAt_idx" ON "PostVersion"("postId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PostSubscription_userId_idx" ON "PostSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PostSubscription_postId_userId_key" ON "PostSubscription"("postId", "userId");

-- CreateIndex
CREATE INDEX "PostModerationLog_postId_createdAt_idx" ON "PostModerationLog"("postId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PostVersion" ADD CONSTRAINT "PostVersion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSubscription" ADD CONSTRAINT "PostSubscription_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostModerationLog" ADD CONSTRAINT "PostModerationLog_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
