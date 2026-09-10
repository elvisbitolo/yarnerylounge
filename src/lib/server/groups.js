import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function mapGroupRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    status: row.status || "active",
    createdBy: row.createdBy,
    createdAt: toMillisValue(row.createdAt) || null,
    sidebarDescription: row.sidebarDescription || "",
    hangoutTag: row.hangoutTag || "",
    hangoutRoomSlug: row.hangoutRoomSlug || "",
    color: row.color || "",
    emoji: row.emoji || "",
    welcomePostId: row.welcomePostId || "",
    welcomePostText: row.welcomePostText || "",
    avatar: row.avatar || "",
    imageUrl: row.imageUrl || "",
  };
}

function mapMemberRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    groupId: row.groupId,
    userId: row.userId,
    name: row.name || "",
    role: row.role || "",
    joinedAt: toMillisValue(row.joinedAt) || null,
  };
}

export async function listGroups() {
  try {
    const prisma = getPrisma();
    if (!prisma) return [];
    const rows = await prisma.group.findMany({
      where: { status: { not: "deleted" } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapGroupRow);
  } catch (err) {
    logError("groups.prisma_list_failed", { error: err.message });
    return [];
  }
}

export async function getGroup(id) {
  try {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.group.findUnique({ where: { id } });
    return row ? mapGroupRow(row) : null;
  } catch (err) {
    logError("groups.prisma_get_failed", { error: err.message });
    return null;
  }
}

export async function getGroupBySlug(slug) {
  try {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.group.findUnique({ where: { slug } });
    return row ? mapGroupRow(row) : null;
  } catch (err) {
    logError("groups.prisma_get_by_slug_failed", { error: err.message });
    return null;
  }
}

export async function getGroupMembers(groupId) {
  try {
    const prisma = getPrisma();
    if (!prisma) return [];
    const rows = await prisma.groupMember.findMany({ where: { groupId } });
    return rows
      .map(mapMemberRow)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  } catch (err) {
    logError("groups.prisma_members_failed", { error: err.message });
    return [];
  }
}

export async function isGroupMember(groupId, uid) {
  const id = `${groupId}_${uid}`;
  try {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.groupMember.findUnique({ where: { id } });
    return row ? mapMemberRow(row) : null;
  } catch (err) {
    logError("groups.prisma_member_failed", { error: err.message });
    return null;
  }
}