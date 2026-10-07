-- Refer-a-member invitations.
--
-- A member hands their personal invite link to someone outside the community.
-- `token` is single-use; `expiresAt` (7 days from creation) makes a stale link
-- read as expired without a sweeper job. Reward payout waits for real
-- activation (`activatedAt` set when the invitee first publishes a post), not
-- for the signup itself.

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "inviterUid" TEXT NOT NULL,
    "recipientName" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedUid" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_inviterUid_status_idx" ON "Invitation"("inviterUid", "status");

-- CreateIndex
CREATE INDEX "Invitation_acceptedUid_idx" ON "Invitation"("acceptedUid");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviterUid_fkey" FOREIGN KEY ("inviterUid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;