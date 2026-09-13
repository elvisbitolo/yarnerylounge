-- Chat Realtime: stream message/conversation changes over Supabase Realtime so
-- members see sent messages instantly while the Postgres write stays the
-- source of truth (durable). The SELECT policies authorize only participants
-- of the affected conversation to watch rows. Prisma connects as `postgres`
-- (BYRPASSLS) so application reads/writes are unaffected.

-- WAL replication: add chat tables to the realtime publication if not present.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'Conversation'
  ) then
    alter publication supabase_realtime add table "Conversation";
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ConversationMessage'
  ) then
    alter publication supabase_realtime add table "ConversationMessage";
  end if;
end $$;

-- Participants may watch conversation rows they belong to.
drop policy if exists "realtime conversation for participants" on "Conversation";
create policy "realtime conversation for participants"
  on "Conversation"
  for select
  to authenticated
  using ("participantIds" @> array[auth.uid()::text]);

-- Participants may watch message rows for conversations they belong to.
drop policy if exists "realtime conversation_messages for participants" on "ConversationMessage";
create policy "realtime conversation_messages for participants"
  on "ConversationMessage"
  for select
  to authenticated
  using (
    exists (
      select 1 from "Conversation" c
      where c."id" = "ConversationMessage"."conversationId"
        and c."participantIds" @> array[auth.uid()::text]
    )
  );