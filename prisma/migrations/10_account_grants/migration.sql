-- Delegated-account access: lets a member sign in with their own credentials
-- and Session row, yet resolve to another member's identity while a grant is
-- active, so everything they do is attributed to the principal.
--
-- Plus the "who actually did this" columns. Author columns are unchanged and
-- non-null-ness is preserved: createdById is set ONLY for content published
-- through a grant, so `createdById IS NOT NULL` is the complete list of
-- delegated activity with no join required.

-- CreateTable
CREATE TABLE "AccountGrant" (
    "id" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['act']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "AccountGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountGrant_granteeId_revokedAt_idx" ON "AccountGrant"("granteeId", "revokedAt");

-- CreateIndex
CREATE INDEX "AccountGrant_principalId_revokedAt_idx" ON "AccountGrant"("principalId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountGrant_principalId_granteeId_key" ON "AccountGrant"("principalId", "granteeId");

-- AddForeignKey
ALTER TABLE "AccountGrant" ADD CONSTRAINT "AccountGrant_principalId_fkey" FOREIGN KEY ("principalId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountGrant" ADD CONSTRAINT "AccountGrant_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "PostComment" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "RoomMessage" ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Post_createdById_idx" ON "Post"("createdById");

-- CreateIndex
CREATE INDEX "PostComment_createdById_idx" ON "PostComment"("createdById");

-- CreateIndex
CREATE INDEX "RoomMessage_createdById_idx" ON "RoomMessage"("createdById");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMessage" ADD CONSTRAINT "RoomMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
