ALTER TABLE "AuthAttempt"
  ADD COLUMN "requestUrl" VARCHAR(300),
  ADD COLUMN "statusCode" INTEGER,
  ADD COLUMN "failureType" TEXT,
  ADD COLUMN "cspViolation" VARCHAR(300);
