-- Speeds up per-member unread notification counts as notification history grows.
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
