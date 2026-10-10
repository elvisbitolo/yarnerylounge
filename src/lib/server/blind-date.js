import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  dayKeyFor,
  hashingKey,
  seededPick,
  computeScore,
  isMatchWindowOpen,
  matchExpiresAt,
  MATCH_WINDOW_MS,
  compareMovingInPriority,
} from "./blind-date-core.js";
import { getMovingInPriorityIds } from "./match-priority.js";
import { BLOCKED_KEY, isSafetyId } from "./member-safety.js";

async function findLatestStoredPick(uid) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.blindDate.findFirst({
        where: { uid, createdAt: { not: null } },
        orderBy: { createdAt: "desc" },
      });
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

// rawCandidates and movingInPriorityIds let the daily-match cron load shared
// data once and reuse it for every member.
export async function pickDailyBlindDate(
  uid,
  rawCandidates = null,
  movingInPriorityIds = null,
  now = Date.now()
) {
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

  const stored = await findLatestStoredPick(uid);
  if (stored?.memberId) {
    const expiresAt = matchExpiresAt(stored.createdAt);
    if (isMatchWindowOpen(stored.createdAt, now)) {
      try {
        const member = await prisma.user.findUnique({ where: { id: stored.memberId } });
        if (member && !member.suspended && !(member.extra && typeof member.extra === "object" && member.extra.profileVisibility === "private") && !isSafetyId(me?.extra, BLOCKED_KEY, member.id) && !isSafetyId(member.extra, BLOCKED_KEY, uid)) {
          return {
            ...stored,
            expiresAt: new Date(expiresAt).toISOString(),
            member,
          };
        }
        await clearDailyBlindDate(uid, stored.date);
      } catch (err) {
        logError("blind-date.prisma_member_failed", { error: err.message });
      }
    }
  }

  let pool = rawCandidates;
  if (!pool) {
    try {
      pool = await prisma.user.findMany({ take: 500 });
    } catch (err) {
      logError("blind-date.prisma_candidates_failed", { error: err.message });
      return null;
    }
  }

  let priorityIds = movingInPriorityIds;
  if (!priorityIds) {
    try {
      priorityIds = await getMovingInPriorityIds(pool, prisma);
    } catch (err) {
      logError("blind-date.priority_load_failed", { error: err.message });
      return null;
    }
  }

  const candidates = pool
    .filter((u) => u.id !== uid)
    .filter((m) => m.name && !m.suspended)
    .filter((m) => !(m.extra && typeof m.extra === "object" && m.extra.profileVisibility === "private"))
    .filter((m) => !isSafetyId(me.extra, BLOCKED_KEY, m.id) && !isSafetyId(m.extra, BLOCKED_KEY, uid))
    .sort((a, b) => compareMovingInPriority(a, b, priorityIds) || computeScore(me, b) - computeScore(me, a))
    .slice(0, 40);

  if (!candidates.length) return null;

  const today = dayKeyFor(now);
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
    createdAt: new Date(now).toISOString(),
  };

  await storePick(entry);

  return { ...entry, expiresAt: new Date(now + MATCH_WINDOW_MS).toISOString(), member: pick };
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
