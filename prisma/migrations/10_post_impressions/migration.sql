-- CreateTable
CREATE TABLE "PostImpression" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostImpression_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PostImpression" ADD CONSTRAINT "PostImpression_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostImpression" ADD CONSTRAINT "PostImpression_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PostImpression_postId_idx" ON "PostImpression"("postId");

CREATE INDEX "PostImpression_viewerId_idx" ON "PostImpression"("viewerId");

CREATE INDEX "PostImpression_createdAt_idx" ON "PostImpression"("createdAt");

CREATE UNIQUE INDEX "PostImpression_postId_viewerId_sessionKey_key" ON "PostImpression"("postId", "viewerId", "sessionKey");