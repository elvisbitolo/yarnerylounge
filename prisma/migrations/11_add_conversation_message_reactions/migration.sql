-- Conversation messages had no reactions column, but the chat UI and the
-- /api/conversations/[id]/messages/[messageId]/reactions route both read and
-- write `reactions`. The write path made Prisma select a column that did not
-- exist, so every reaction POST failed and no reactions ever reached the client.
--
-- Post and RoomMessage already store reactions as a Json map of
-- { emoji: { userId: true } }; this mirrors that shape for direct messages.

ALTER TABLE "ConversationMessage" ADD COLUMN "reactions" JSONB;
