DROP TABLE IF EXISTS "Notification";
DROP TABLE IF EXISTS "PushSubscription";
DROP TABLE IF EXISTS "MemberWatch";
DROP TABLE IF EXISTS "PostSubscription";
DROP TABLE IF EXISTS "Announcement";

ALTER TABLE "User" DROP COLUMN IF EXISTS "notifications";
ALTER TABLE "User" DROP COLUMN IF EXISTS "notificationPreferences";
