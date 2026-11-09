-- Persist failed authentication attempts without requiring a User row.
-- Failed registrations and unknown-email sign-ins have no corresponding member.
CREATE TABLE "AuthAttempt" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "action" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "errorCode" TEXT,
  "errorMessage" VARCHAR(500),
  "source" TEXT NOT NULL DEFAULT 'client_reported',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthAttempt_createdAt_idx" ON "AuthAttempt"("createdAt" DESC);
CREATE INDEX "AuthAttempt_email_createdAt_idx" ON "AuthAttempt"("email", "createdAt" DESC);
