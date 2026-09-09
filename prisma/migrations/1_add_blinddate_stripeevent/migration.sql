-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "regionKey" TEXT DEFAULT '';

-- AlterTable
ALTER TABLE "HostAssignment" ADD COLUMN     "canRecord" BOOLEAN;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN,
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN     "priceId" TEXT,
ADD COLUMN     "providerCustomerId" TEXT,
ADD COLUMN     "providerSubscriptionId" TEXT,
ADD COLUMN     "trialStart" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "extra" JSONB;

-- CreateTable
CREATE TABLE "BlindDate" (
    "id" TEXT NOT NULL,
    "uid" TEXT,
    "date" TEXT,
    "memberId" TEXT,
    "memberName" TEXT,
    "photoURL" TEXT,
    "headline" TEXT,
    "country" TEXT,
    "hobbies" TEXT[],
    "crafts" TEXT[],
    "score" INTEGER,
    "createdAt" TEXT,

    CONSTRAINT "BlindDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT,
    "status" TEXT,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlindDate_uid_idx" ON "BlindDate"("uid");

-- CreateIndex
CREATE INDEX "BlindDate_memberId_idx" ON "BlindDate"("memberId");

-- CreateIndex
CREATE INDEX "StripeEvent_type_idx" ON "StripeEvent"("type");

