import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  RECOGNITION_POINTS,
  validateRecognition,
} from "@/lib/server/recognition-core";
import { awardPoints } from "@/lib/server/gamification";
import { createNotification } from "@/lib/server/notifications";

export { RECOGNITION_POINTS };

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function createRecognition({ fromUid, fromName, toUid, value, note }) {
  const cleanNote = typeof note === "string" ? note.trim() : "";
  const check = validateRecognition({ value, note: cleanNote, toUid, fromUid });
  if (!check.ok) {
    throw Object.assign(new Error(check.reason), { code: 400 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    throw Object.assign(new Error("Database unavailable"), { code: 503 });
  }

  let toName = "";
  try {
    const toUser = await prisma.user.findUnique({ where: { id: toUid } });
    if (!toUser) {
      throw Object.assign(new Error("Member not found"), { code: 404 });
    }
    toName = toUser.name || "Member";

    await prisma.$transaction([
      prisma.recognition.create({
        data: {
          fromUid,
          fromName: fromName || "Member",
          toUid,
          toName,
          value,
          note: cleanNote,
          createdAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: toUid },
        data: { recognitionCount: { increment: 1 } },
      }),
    ]);
  } catch (err) {
    if (err.code === 404) throw err;
    logError("recognition.prisma_create_failed", { error: err.message });
    throw Object.assign(new Error("Failed to create recognition"), { code: 500 });
  }

  await awardPoints(toUid, RECOGNITION_POINTS, toName);
  await createNotification({
    userId: toUid,
    type: "recognition",
    actorId: fromUid,
    actorName: fromName || "Member",
    targetId: toUid,
    href: `/members/${toUid}`,
    text: `recognized you for being ${value}${cleanNote ? ` — "${cleanNote.slice(0, 120)}"` : ""}`,
  });

  return { ok: true, value };
}

export async function listRecognitions(uid, limit = 20) {
  const safeLimit = Math.max(Number(limit) || 20, 1);
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.recognition.findMany({
        where: { toUid: uid },
        orderBy: { createdAt: "desc" },
        take: safeLimit,
      });
      if (rows.length) {
        return rows.map((row) => ({
          id: row.id,
          fromUid: row.fromUid,
          fromName: row.fromName,
          value: row.value,
          note: row.note || "",
          createdAt: toMillis(row.createdAt),
        }));
      }
    } catch (err) {
      logError("recognition.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getRecognitionCount(uid) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.user.findUnique({
        where: { id: uid },
        select: { recognitionCount: true },
      });
      if (row) return Number(row.recognitionCount) || 0;
    } catch (err) {
      logError("recognition.prisma_count_failed", { error: err.message });
    }
  }
  return 0;
}

export async function getRecognitionLeaderboard(limit = 20) {
  const safeLimit = Math.max(Number(limit) || 20, 1);
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.user.findMany({
        where: { recognitionCount: { gt: 0 }, suspended: { not: true } },
        orderBy: { recognitionCount: "desc" },
        take: safeLimit,
        select: { id: true, name: true, recognitionCount: true },
      });
      return rows.map((row, i) => ({
        userId: row.id,
        name: row.name || "Member",
        count: Number(row.recognitionCount) || 0,
        rank: i + 1,
      }));
    } catch (err) {
      logError("recognition.prisma_leaderboard_failed", { error: err.message });
    }
  }
  return [];
}
