// Builds the row for an in-app notification.
//
// Notification.actorId is a foreign key to User(id). That is the awkward part:
// an empty string is not a valid actor, so Postgres rejects the whole insert
// and the notification is silently lost - createNotification() swallows the
// error. An actor-less notification has to store NULL, which the column
// allows, and the denormalized actorName on the row is what the member sees
// in the list.
//
// Storing "" instead of null is not a cosmetic difference. Every notification
// written without an actor used to vanish: the re-engagement nudges, the
// event reminders, the daily match, the invite receipts and the automation
// messages all went in with an empty actor and were dropped by the foreign
// key.
//
// The actorName is a display string, not a member reference. "The Speakeasy
// Team" and "Secret Yarnery" are names the platform speaks with, and they
// stay valid now that there is no service account behind them.
export function notificationRow({
  userId,
  type,
  actorId,
  actorName,
  targetId,
  href,
  text,
  createdAt,
}) {
  return {
    userId,
    type,
    actorId: actorId || null,
    actorName: actorName || "",
    targetId: targetId || "",
    href: href || "",
    text,
    read: false,
    createdAt: createdAt || new Date(),
  };
}
