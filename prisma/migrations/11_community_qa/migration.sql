-- Community Q&A board: members ask a question and receive written answers.

CREATE TABLE "CommunityQuestion" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunityAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityQuestion_status_createdAt_idx" ON "CommunityQuestion"("status", "createdAt" DESC);
CREATE INDEX "CommunityAnswer_questionId_createdAt_idx" ON "CommunityAnswer"("questionId", "createdAt" ASC);

ALTER TABLE "CommunityQuestion" ADD CONSTRAINT "CommunityQuestion_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityAnswer" ADD CONSTRAINT "CommunityAnswer_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "CommunityQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityAnswer" ADD CONSTRAINT "CommunityAnswer_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;