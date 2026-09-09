import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getUserDoc } from "@/lib/server/auth";

const NOTIFICATION_TYPE_TO_PREF = {
  comment: "feed",
  like: "feed",
  mention: "mentions",
  chat: "chat",
  event_reminder: "events",
  event_rsvp: "events",
  space_activity: "feed",
  follow: "feed",
  automation: "automations",
  digest: "automations",
};

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return new Date(v.toMillis());
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  return new Date(v);
}

// Maps a Prisma Notification row to the Firestore-doc shape consumers expect.
function mapNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    actorId: row.actorId || "",
    actorName: row.actorName || "",
    targetId: row.targetId || "",
    href: row.href || "",
    text: row.text,
    read: !!row.read,
    readAt: toMillisValue(row.readAt) || null,
    createdAt: toMillisValue(row.createdAt),
  };
}

async function shouldNotify(userId, type) {
  const prefKey = NOTIFICATION_TYPE_TO_PREF[type];
  if (!prefKey) return true;
  const userDoc = await getUserDoc(userId);
  const prefs = userDoc?.notificationPreferences;
  if (!prefs) return true;
  return prefs[prefKey] !== false;
}

export async function createNotification({
  userId,
  type,
  actorId,
  actorName,
  targetId,
  href,
  text,
}) {
  const enabled = await shouldNotify(userId, type);
  if (!enabled) return;

  const data = {
    userId,
    type,
    actorId: actorId || "",
    actorName: actorName || "",
    targetId: targetId || "",
    href: href || "",
    text,
    read: false,
    createdAt: new Date(),
  };
  try {
    const prisma = getPrisma();
    if (!prisma) return;
    await prisma.notification.create({ data });
  } catch (err) {
    logError("notifications.prisma_create_failed", { error: err.message });
  }
}

export async function listNotifications(uid, limit = 50) {
  try {
    const prisma = getPrisma();
    if (!prisma) return [];
    const rows = await prisma.notification.findMany({
      where: { userId: uid },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapNotificationRow);
  } catch (err) {
    logError("notifications.prisma_list_failed", { error: err.message });
    return [];
  }
}

export async function markNotificationRead(id, uid) {
  try {
    const prisma = getPrisma();
    if (!prisma) return false;
    const row = await prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== uid) return false;
    await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
    return true;
  } catch (err) {
    logError("notifications.prisma_mark_read_failed", { error: err.message });
    return false;
  }
}