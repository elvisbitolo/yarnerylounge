CREATE TABLE "WhatsAppMessage" (
  "id" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "userId" TEXT,
  "direction" TEXT NOT NULL,
  "fromPhone" TEXT NOT NULL,
  "toPhone" TEXT,
  "contactName" TEXT,
  "text" TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'text',
  "status" TEXT NOT NULL DEFAULT 'received',
  "conversationId" TEXT,
  "replyToMessageId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMessage_providerMessageId_key" ON "WhatsAppMessage"("providerMessageId");
CREATE INDEX "WhatsAppMessage_userId_createdAt_idx" ON "WhatsAppMessage"("userId", "createdAt");
CREATE INDEX "WhatsAppMessage_direction_createdAt_idx" ON "WhatsAppMessage"("direction", "createdAt");
CREATE INDEX "WhatsAppMessage_conversationId_idx" ON "WhatsAppMessage"("conversationId");

ALTER TABLE "WhatsAppMessage"
ADD CONSTRAINT "WhatsAppMessage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
