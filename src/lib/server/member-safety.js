import { getPrisma } from "@/lib/db/prisma";
import { BLOCKED_KEY, MUTED_KEY, isSafetyId, updateSafetyExtra } from "./member-safety-core.js";

export async function getMemberSafety(uid, targetId) {
  if (!uid || !targetId || uid === targetId) return { blocked: false, muted: false };
  const prisma = getPrisma();
  const rows = await prisma.user.findMany({
    where: { id: { in: [uid, targetId] } },
    select: { id: true, extra: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row.extra]));
  const mine = byId.get(uid);
  const theirs = byId.get(targetId);
  return {
    blocked: isSafetyId(mine, BLOCKED_KEY, targetId) || isSafetyId(theirs, BLOCKED_KEY, uid),
    muted: isSafetyId(mine, MUTED_KEY, targetId),
  };
}

export async function setMemberSafety(uid, targetId, kind, enabled) {
  if (!uid || !targetId || uid === targetId) throw new Error("INVALID_MEMBER");
  if (!["block", "mute"].includes(kind)) throw new Error("INVALID_SAFETY_ACTION");
  const prisma = getPrisma();
  const row = await prisma.user.findUnique({ where: { id: uid }, select: { extra: true } });
  if (!row) throw new Error("MEMBER_NOT_FOUND");
  const key = kind === "block" ? BLOCKED_KEY : MUTED_KEY;
  const extra = updateSafetyExtra(row.extra, key, targetId, enabled);
  await prisma.user.update({ where: { id: uid }, data: { extra, updatedAt: new Date() } });
  return getMemberSafety(uid, targetId);
}

export async function isEitherMemberBlocked(uid, targetId) {
  const safety = await getMemberSafety(uid, targetId);
  return safety.blocked;
}

export async function blockedMemberIdsFor(uid, candidateIds = []) {
  if (!uid || !Array.isArray(candidateIds) || candidateIds.length === 0) return new Set();
  const prisma = getPrisma();
  if (!prisma) return new Set();
  const ids = [...new Set(candidateIds.filter((id) => id && id !== uid))];
  if (!ids.length) return new Set();
  const rows = await prisma.user.findMany({
    where: { id: { in: [uid, ...ids] } },
    select: { id: true, extra: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row.extra]));
  const blocked = new Set();
  const mine = byId.get(uid);
  for (const id of ids) {
    if (isSafetyId(mine, BLOCKED_KEY, id) || isSafetyId(byId.get(id), BLOCKED_KEY, uid)) blocked.add(id);
  }
  return blocked;
}

export { BLOCKED_KEY, MUTED_KEY, isSafetyId, updateSafetyExtra } from "./member-safety-core.js";
