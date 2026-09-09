import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const ROOM_SIGNAL_TYPES = ["hand", "reaction", "speakerInvite"];

function toMillisValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function encodeSignal(row) {
  return {
    id: row.id,
    type: row.type || "",
    fromIdentity: row.fromIdentity,
    target: row.target || "",
    value: row.value ?? null,
    emoji: row.emoji || "",
    hostName: row.hostName || "",
    createdAt: toMillisValue(row.createdAt) || Date.now(),
  };
}

export async function getRoomForSignals(roomId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.room.findUnique({ where: { id: roomId } });
      if (row && (row.status || "active") === "active") {
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description || "",
          status: row.status || "active",
          groupId: row.groupId || "",
          spaceId: row.spaceId || "",
        };
      }
      if (row) return null;
    } catch (err) {
      logError("room-signals.prisma_room_failed", { error: err.message });
    }
  }
  return null;
}

export async function addRoomSignal(roomId, fromIdentity, payload) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.roomSignal.create({
        data: {
          roomId,
          type: payload.type || "",
          fromIdentity,
          target: payload.target || "",
          value: payload.value ?? null,
          emoji: payload.emoji || "",
          hostName: payload.hostName || "",
          createdAt: new Date(),
        },
      });
      return created.id;
    } catch (err) {
      logError("room-signals.prisma_create_failed", { error: err.message });
    }
  }
  return null;
}

export async function listRoomSignals(roomId, { after, limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const afterTs = Number.isFinite(after) ? after : 0;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.roomSignal.findMany({
        where: { roomId, createdAt: { gt: new Date(afterTs) } },
        orderBy: { createdAt: "asc" },
        take: safeLimit,
      });
      const signals = rows.map(encodeSignal);
      return { signals, hasMore: rows.length >= safeLimit };
    } catch (err) {
      logError("room-signals.prisma_list_failed", { error: err.message });
    }
  }
  return { signals: [], hasMore: false };
}
