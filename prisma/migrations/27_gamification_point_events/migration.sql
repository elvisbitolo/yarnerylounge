CREATE TABLE "GamificationPointEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GamificationPointEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GamificationPointEvent_userId_createdAt_idx"
  ON "GamificationPointEvent"("userId", "createdAt" DESC);

CREATE INDEX "GamificationPointEvent_createdAt_idx"
  ON "GamificationPointEvent"("createdAt");
