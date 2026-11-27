ALTER TABLE "User" ADD COLUMN "shopifyCustomerAccessToken" TEXT;
ALTER TABLE "User" ADD COLUMN "shopifyCustomerRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "shopifyCustomerTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "shopifyCustomerEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "shopifyCustomerLinkedAt" TIMESTAMP(3);
