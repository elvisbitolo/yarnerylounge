import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getRoom } from "@/lib/server/rooms";

const BATCH_LIMIT = 400;
export const ANNOUNCEMENT_MAX = 2000;

async function communityRecipients() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.user.findMany({
        where: { suspended: { not: true } },
        take: 1000,
        select: { id: true },
      });
      if (rows.length) return rows.map((row) => row.id);
    } catch (err) {
      logError("announcements.prisma_community_recipients_failed", { error: err.message });
    }
  }
  return [];
}

async function spaceRecipients(spaceId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.spaceMember.findMany({
        where: { spaceId },
        take: 1000,
        select: { userId: true },
      });
      if (rows.length) return rows.map((row) => row.userId);
    } catch (err) {
      logError("announcements.prisma_space_recipients_failed", { error: err.message });
    }
  }
  return [];
}

async function groupRecipients(groupId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.groupMember.findMany({
        where: { groupId },
        take: 1000,
        select: { userId: true },
      });
      if (rows.length) return rows.map((row) => row.userId);
    } catch (err) {
      logError("announcements.prisma_group_recipients_failed", { error: err.message });
    }
  }
  return [];
}

async function roomRecipients(roomId) {
  const room = await getRoom(roomId);
  if (!room) return [];
  if (room.spaceId) return spaceRecipients(room.spaceId);
  if (room.groupId) return groupRecipients(room.groupId);
  return [];
}

export async function recipientsForScope({ scopeType, scopeId }) {
  if (scopeType === "community") return communityRecipients();
  if (scopeType === "space") return spaceRecipients(scopeId);
  if (scopeType === "group") return groupRecipients(scopeId);
  if (scopeType === "room") return roomRecipients(scopeId);
  return [];
}

export async function sendAnnouncement({
  scopeType,
  scopeId,
  message,
  href = "/dashboard",
  actorId = "",
  actorName = "",
}) {
  const text = typeof message === "string" ? message.trim().slice(0, ANNOUNCEMENT_MAX) : "";
  if (!text) throw Object.assign(new Error("Announcement message required"), { code: 400 });

  const uids = await recipientsForScope({ scopeType, scopeId });
  const prisma = getPrisma();
  if (prisma) {
    try {
      if (uids.length) {
        await prisma.notification.createMany({
          data: uids.map((userId) => ({
            userId,
            type: "announcement",
            actorId: actorId || "",
            actorName: actorName || "Secret Yarnery",
            targetId: scopeId || "",
            href,
            text,
            read: false,
            createdAt: new Date(),
          })),
        });
      }
      await prisma.announcement.create({
        data: {
          title: text.slice(0, 100),
          body: text,
          authorId: actorId || "",
          authorName: actorName || "Secret Yarnery",
          spaceId: scopeId || "",
          createdAt: new Date(),
        },
      });
      return { sentCount: uids.length };
    } catch (err) {
      logError("announcements.prisma_send_failed", { error: err.message });
    }
  }
  return { sentCount: uids.length };
}

export async function listAnnouncements(limit = 20) {
  const safeLimit = Math.max(Number(limit) || 20, 1);
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.announcement.findMany({
        orderBy: { createdAt: "desc" },
        take: safeLimit,
      });
      if (rows.length) {
        return rows.map((row) => ({
          id: row.id,
          scopeType: row.spaceId,
          scopeId: row.spaceId,
          message: row.body || "",
          sentCount: 0,
          actorId: row.authorId || "",
          createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : 0,
        }));
      }
    } catch (err) {
      logError("announcements.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}
