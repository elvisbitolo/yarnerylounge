-- Pinned conversation messages: the pinned-messages feature has always
-- queried and written these columns, but ConversationMessage was never created
-- with them (root Post and RoomMessage already have them).

ALTER TABLE "ConversationMessage" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConversationMessage" ADD COLUMN "pinnedAt" TIMESTAMP(3);