-- Allow one browser push subscription per device instead of one per member.
-- Preserve existing subscriptions while moving their primary key away from userId.
ALTER TABLE "PushSubscription" DROP CONSTRAINT IF EXISTS "PushSubscription_id_fkey";
ALTER TABLE "PushSubscription" DROP CONSTRAINT IF EXISTS "PushSubscription_pkey";

UPDATE "PushSubscription"
SET "id" = 'legacy-' || "id";

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key"
  ON "PushSubscription"("endpoint");

CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx"
  ON "PushSubscription"("userId");
