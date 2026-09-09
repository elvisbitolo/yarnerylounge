-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "spaceId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Course" ALTER COLUMN "spaceId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "roomSlug" DROP DEFAULT,
ALTER COLUMN "spaceId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Question" ALTER COLUMN "spaceId" DROP DEFAULT;

