import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { dayKeyFor, hashingKey, seededPick, computeScore } from "./blind-date-core.js";
import { BLOCKED_KEY, isSafetyId } from "./member-safety.js";

async function findStoredPick(uid, date) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.blindDate.findFirst({ where: { uid, date } });
      if (row) {
        return {
          uid: row.uid,
          date: row.date,
          memberId: row.memberId,
          memberName: row.memberName,
          photoURL: row.photoURL,
          headline: row.headline,
          country: row.country,
          hobbies: row.hobbies,
          crafts: row.crafts,
          score: row.score,
          createdAt: row.createdAt,
        };
      }
    } catch (err) {
      logError("blind-date.prisma_read_failed", { error: err.message });
    }
  }
  return null;
}

async function storePick(entry) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.blindDate.create({
        data: {
          id: hashingKey(entry.uid, entry.date),
          uid: entry.uid,
          date: entry.date,
          memberId: entry.memberId,
          memberName: entry.memberName,
          photoURL: entry.photoURL,
          headline: entry.headline,
          country: entry.country,
          hobbies: entry.hobbies,
          crafts: entry.crafts,
          score: entry.score,
          createdAt: entry.createdAt,
        },
      });
    } catch (err) {
      logError("blind-date.prisma_write_failed", { error: err.message });
    }
  }
}

export async function pickDailyBlindDate(uid) {
  const today = dayKeyFor();
  const prisma = getPrisma();
  if (!prisma) return null;

  let me = null;
  try {
    me = await prisma.user.findUnique({ where: { id: uid } });
  } catch (err) {
    logError("blind-date.prisma_me_failed", { error: err.message });
    return null;
  }
  if (!me) return null;

  const stored = await findStoredPick(uid, today);
  if (stored?.memberId) {
    try {
      const member = await prisma.user.findUnique({ where: { id: stored.memberId } });
      if (member && !member.suspended && !isSafetyId(me?.extra, BLOCKED_KEY, member.id) && !isSafetyId(member.extra, BLOCKED_KEY, uid)) {
        return { ...stored, member };
      }
      await clearDailyBlindDate(uid, today);
    } catch (err) {
      logError("blind-date.prisma_member_failed", { error: err.message });
    }
  }

  let rawCandidates = [];
  try {
    rawCandidates = await prisma.user.findMany({ take: 500 });
  } catch (err) {
    logError("blind-date.prisma_candidates_failed", { error: err.message });
    return null;
  }

  const candidates = rawCandidates
    .filter((u) => u.id !== uid)
    .filter((m) => m.name && !m.suspended)
    .filter((m) => !(m.extra && typeof m.extra === "object" && m.extra.profileVisibility === "private"))
    .filter((m) => !isSafetyId(me.extra, BLOCKED_KEY, m.id) && !isSafetyId(m.extra, BLOCKED_KEY, uid))
    .sort((a, b) => computeScore(me, b) - computeScore(me, a))
    .slice(0, 40);

  if (!candidates.length) return null;

  const pick = seededPick(candidates, uid, today);
  const entry = {
    uid,
    date: today,
    memberId: pick.id,
    memberName: pick.name,
    photoURL: pick.photoURL || "",
    headline: pick.headline || "",
    country: pick.country || "",
    hobbies: Array.isArray(pick.hobbies) ? pick.hobbies : [],
    crafts: Array.isArray(pick.crafts) ? pick.crafts : [],
    score: computeScore(me, pick),
    createdAt: new Date().toISOString(),
  };

  await storePick(entry);

  return { ...entry, member: pick };
}

export async function clearDailyBlindDate(uid, date = "") {
  const day = date || dayKeyFor();
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.blindDate.deleteMany({ where: { uid, date: day } });
    } catch (err) {
      logError("blind-date.prisma_delete_failed", { error: err.message });
    }
  }
}
