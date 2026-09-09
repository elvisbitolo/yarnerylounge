import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function mapFollowRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    followerId: row.followerId,
    followingId: row.followingId,
    createdAt: toMillisValue(row.createdAt) || null,
  };
}

export async function followUser(followerId, followingId) {
  if (followerId === followingId) return { ok: false, error: "Cannot follow yourself" };
  const docId = `${followerId}_${followingId}`;
  try {
    await getPrisma().follow.create({
      data: { id: docId, followerId, followingId, createdAt: new Date() },
    });
  } catch (err) {
    if (String(err.code).toLowerCase().includes("unique")) {
      return { ok: true, following: true };
    }
    logError("follows.prisma_create_failed", { error: err.message });
    throw err;
  }
  return { ok: true, following: true };
}

export async function unfollowUser(followerId, followingId) {
  const docId = `${followerId}_${followingId}`;
  try {
    const prisma = getPrisma();
    if (!prisma) return { ok: true, following: false };
    await prisma.follow.deleteMany({ where: { id: docId } });
  } catch (err) {
    logError("follows.prisma_delete_failed", { error: err.message });
  }
  return { ok: true, following: false };
}

export async function isFollowing(followerId, followingId) {
  const docId = `${followerId}_${followingId}`;
  try {
    const prisma = getPrisma();
    if (!prisma) return false;
    const row = await prisma.follow.findUnique({ where: { id: docId } });
    return !!row;
  } catch (err) {
    logError("follows.prisma_is_following_failed", { error: err.message });
    return false;
  }
}

export async function getFollowers(userId) {
  try {
    const prisma = getPrisma();
    if (!prisma) return [];
    const rows = await prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapFollowRow);
  } catch (err) {
    logError("follows.prisma_followers_failed", { error: err.message });
    return [];
  }
}

export async function getFollowing(userId) {
  try {
    const prisma = getPrisma();
    if (!prisma) return [];
    const rows = await prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapFollowRow);
  } catch (err) {
    logError("follows.prisma_following_failed", { error: err.message });
    return [];
  }
}

export async function getFollowerCount(userId) {
  try {
    const prisma = getPrisma();
    if (!prisma) return 0;
    return await prisma.follow.count({ where: { followingId: userId } });
  } catch (err) {
    logError("follows.prisma_follower_count_failed", { error: err.message });
    return 0;
  }
}

export async function getFollowingCount(userId) {
  try {
    const prisma = getPrisma();
    if (!prisma) return 0;
    return await prisma.follow.count({ where: { followerId: userId } });
  } catch (err) {
    logError("follows.prisma_following_count_failed", { error: err.message });
    return 0;
  }
}