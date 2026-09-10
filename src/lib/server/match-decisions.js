import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { dayKeyFor } from "./blind-date-core.js";

export const MATCH_DECISIONS = ["accepted", "passed"];

export async function getMatchDecision(uid, date = dayKeyFor()) {
  const prisma = getPrisma();
  if (!prisma || !uid) return null;
  try {
    return await prisma.matchDecision.findUnique({
      where: { userId_date: { userId: uid, date } },
      select: { id: true, userId: true, targetUserId: true, date: true, decision: true, createdAt: true, updatedAt: true },
    });
  } catch (err) {
    logError("match-decision.read_failed", { error: err.message });
    return null;
  }
}

export async function saveMatchDecision({ uid, targetUserId, date = dayKeyFor(), decision }) {
  if (!uid || !targetUserId || uid === targetUserId || !MATCH_DECISIONS.includes(decision)) {
    return { error: "Invalid match decision" };
  }
  const prisma = getPrisma();
  if (!prisma) return { error: "Database unavailable" };
  try {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, suspended: true },
    });
    if (!target || target.suspended) return { error: "Match is no longer available" };

    const row = await prisma.matchDecision.upsert({
      where: { userId_date: { userId: uid, date } },
      create: { id: `${uid}:${date}`, userId: uid, targetUserId, date, decision },
      update: { targetUserId, decision },
      select: { id: true, userId: true, targetUserId: true, date: true, decision: true, createdAt: true, updatedAt: true },
    });
    return { decision: row };
  } catch (err) {
    logError("match-decision.write_failed", { error: err.message, uid, targetUserId });
    return { error: "Could not save match decision" };
  }
}
