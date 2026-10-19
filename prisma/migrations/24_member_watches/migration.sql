-- CreateTable
CREATE TABLE "MemberWatch" (
    "id" TEXT NOT NULL,
    "watcherId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOnlineNotifiedAt" TIMESTAMP(3),
    "lastRoomId" TEXT,
    "lastRoomNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "MemberWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberWatch_targetId_idx" ON "MemberWatch"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberWatch_watcherId_targetId_key" ON "MemberWatch"("watcherId", "targetId");

-- AddForeignKey
ALTER TABLE "MemberWatch" ADD CONSTRAINT "MemberWatch_watcherId_fkey" FOREIGN KEY ("watcherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberWatch" ADD CONSTRAINT "MemberWatch_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
