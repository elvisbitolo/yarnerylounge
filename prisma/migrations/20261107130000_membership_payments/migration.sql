CREATE TABLE "MembershipPayment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'shopify',
  "providerOrderId" TEXT NOT NULL,
  "orderNumber" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'paid',
  "plan" TEXT,
  "tier" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MembershipPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipPayment_providerOrderId_key" ON "MembershipPayment"("providerOrderId");
CREATE INDEX "MembershipPayment_userId_paidAt_idx" ON "MembershipPayment"("userId", "paidAt" DESC);
CREATE INDEX "MembershipPayment_status_paidAt_idx" ON "MembershipPayment"("status", "paidAt" DESC);
