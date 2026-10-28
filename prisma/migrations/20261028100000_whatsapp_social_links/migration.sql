-- WhatsApp notification preferences and account links.
CREATE TABLE "SocialLink" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "phoneE164" TEXT NOT NULL,
  "waId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialLink_userId_provider_key" ON "SocialLink"("userId", "provider");
CREATE UNIQUE INDEX "SocialLink_provider_waId_key" ON "SocialLink"("provider", "waId");
CREATE INDEX "SocialLink_phoneE164_idx" ON "SocialLink"("phoneE164");

ALTER TABLE "SocialLink"
  ADD CONSTRAINT "SocialLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
