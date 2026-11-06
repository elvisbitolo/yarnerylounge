CREATE TABLE "EventSubmission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "startTime" TIMESTAMPTZ(3) NOT NULL,
  "endTime" TIMESTAMPTZ(3),
  "status" TEXT NOT NULL DEFAULT 'pending',
  "eventId" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventSubmission_status_createdAt_idx" ON "EventSubmission"("status", "createdAt");
CREATE INDEX "EventSubmission_userId_idx" ON "EventSubmission"("userId");