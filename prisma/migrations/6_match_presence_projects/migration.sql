-- Match decisions, room presence sessions, and dedicated project portfolios.

CREATE TABLE "RoomPresence" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "RoomPresence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatchDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MatchDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "craft" TEXT,
    "projectType" TEXT,
    "yarnDetails" TEXT,
    "hookSize" TEXT,
    "imageUrls" TEXT[] NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchDecision_userId_date_key" ON "MatchDecision"("userId", "date");
CREATE INDEX "RoomPresence_roomId_lastSeenAt_idx" ON "RoomPresence"("roomId", "lastSeenAt");
CREATE INDEX "RoomPresence_userId_lastSeenAt_idx" ON "RoomPresence"("userId", "lastSeenAt");
CREATE INDEX "MatchDecision_targetUserId_createdAt_idx" ON "MatchDecision"("targetUserId", "createdAt");
CREATE INDEX "Project_userId_status_createdAt_idx" ON "Project"("userId", "status", "createdAt" DESC);
CREATE INDEX "Project_userId_featured_idx" ON "Project"("userId", "featured");

ALTER TABLE "RoomPresence" ADD CONSTRAINT "RoomPresence_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomPresence" ADD CONSTRAINT "RoomPresence_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchDecision" ADD CONSTRAINT "MatchDecision_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
