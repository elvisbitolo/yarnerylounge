-- Typing indicators are ephemeral now, carried over Supabase Realtime Broadcast
-- (see openTypingChannel in src/lib/chat-realtime.js). A keystroke no longer
-- passes through Postgres, so the per-keystroke upsert table is dead weight and
-- is dropped rather than left to accumulate rows.

DROP TABLE "Typing";
