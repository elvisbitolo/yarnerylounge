-- Room imagery was added to the Prisma model without a matching database migration.
ALTER TABLE "Room" ADD COLUMN "imageUrl" TEXT;
