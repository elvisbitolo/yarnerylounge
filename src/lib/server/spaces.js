import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import {
  SPACE_FEATURES,
  SPACE_FEATURE_LABELS,
  SPACE_ACCESS,
  SPACE_ACCESS_LABELS,
  slugify,
  normalizeFeatures,
  normalizeAccess,
} from "@/lib/server/spaces-core";

export {
  SPACE_FEATURES,
  SPACE_FEATURE_LABELS,
  SPACE_ACCESS,
  SPACE_ACCESS_LABELS,
  slugify,
  normalizeFeatures,
  normalizeAccess,
};

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return new Date(v).getTime();
}

function mapSpaceRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    features: row.features || {},
    access: row.access || "public",
    requiredTier: row.requiredTier || "",
    purchasePriceCents: row.purchasePriceCents || 0,
    publicPreview: !!row.publicPreview,
    status: row.status || "active",
    createdBy: row.createdBy,
    avatar: row.avatar || "",
    createdAt: toMillisValue(row.createdAt) || null,
  };
}

function mapMemberRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    spaceId: row.spaceId,
    userId: row.userId,
    name: row.name || "",
    role: row.role || "member",
    joinedAt: toMillisValue(row.joinedAt) || null,
  };
}

export async function listSpaces() {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.space.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return rows.map(mapSpaceRow);
    } catch (err) {
      logError("spaces.prisma_list_failed", { error: err.message });
    }
  }
  return [];
}

export async function getSpaceBySlug(slug) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.space.findUnique({ where: { slug } });
      return row ? mapSpaceRow(row) : null;
    } catch (err) {
      logError("spaces.prisma_get_by_slug_failed", { error: err.message });
    }
  }
  return null;
}

export async function getSpace(id) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.space.findUnique({ where: { id } });
      return row ? mapSpaceRow(row) : null;
    } catch (err) {
      logError("spaces.prisma_get_failed", { error: err.message });
    }
  }
  return null;
}

export async function getSpaceMembers(spaceId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.spaceMember.findMany({ where: { spaceId } });
      return rows
        .map(mapMemberRow)
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    } catch (err) {
      logError("spaces.prisma_members_failed", { error: err.message });
    }
  }
  return [];
}

export async function isSpaceMember(spaceId, uid) {
  const id = `${spaceId}_${uid}`;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const row = await prisma.spaceMember.findUnique({ where: { id } });
      return row ? mapMemberRow(row) : null;
    } catch (err) {
      logError("spaces.prisma_member_failed", { error: err.message });
    }
  }
  return null;
}

export async function addSpaceMember(spaceId, uid, name, role = "member") {
  const id = `${spaceId}_${uid}`;
  const data = {
    id,
    spaceId,
    userId: uid,
    name,
    role,
    joinedAt: new Date(),
  };
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.spaceMember.create({ data });
      return true;
    } catch (err) {
      if (String(err.code).toLowerCase().includes("unique")) return false;
      logError("spaces.prisma_member_create_failed", { error: err.message });
    }
  }
  return false;
}

export async function removeSpaceMember(spaceId, uid) {
  const id = `${spaceId}_${uid}`;
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.spaceMember.deleteMany({ where: { id } });
    } catch (err) {
      logError("spaces.prisma_member_remove_failed", { error: err.message });
    }
  }
}

export async function createSpace({ name, description, features, access, requiredTier, purchasePriceCents, publicPreview, createdBy }) {
  const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  const data = {
    name,
    slug,
    description: description || "",
    features: normalizeFeatures(features),
    access: normalizeAccess(access),
    requiredTier: requiredTier === "premium" ? "premium" : "",
    purchasePriceCents: Math.max(Number(purchasePriceCents) || 0, 0),
    publicPreview: !!publicPreview,
    status: "active",
    createdBy,
    createdAt: new Date(),
  };
  const prisma = getPrisma();
  if (prisma) {
    try {
      const created = await prisma.space.create({ data });
      return { id: created.id, slug, name, description: data.description };
    } catch (err) {
      logError("spaces.prisma_create_failed", { error: err.message });
    }
  }
  return { id: "", slug, name, description: data.description };
}

export async function updateSpace(spaceId, { name, description, features, access, requiredTier, purchasePriceCents, publicPreview }) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.space.findUnique({ where: { id: spaceId } });
      if (!existing) return null;
      const data = {};
      if (typeof name === "string" && name.trim()) data.name = name.trim();
      if (typeof description === "string") data.description = description;
      if (features) data.features = normalizeFeatures(features);
      if (access) data.access = normalizeAccess(access);
      data.requiredTier = requiredTier === "premium" ? "premium" : "";
      if (purchasePriceCents !== undefined) {
        data.purchasePriceCents = Math.max(Number(purchasePriceCents) || 0, 0);
      }
      if (publicPreview !== undefined) data.publicPreview = !!publicPreview;
      const updated = await prisma.space.update({ where: { id: spaceId }, data });
      return mapSpaceRow(updated);
    } catch (err) {
      logError("spaces.prisma_update_failed", { error: err.message });
    }
  }
  return null;
}

export async function deleteSpace(spaceId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.spaceMember.deleteMany({ where: { spaceId } });
        await tx.space.deleteMany({ where: { id: spaceId } });
      });
    } catch (err) {
      logError("spaces.prisma_delete_failed", { error: err.message });
    }
  }
}

export async function cascadeDeleteSpace(spaceId) {
  const { deleteWhere, deletePostWithComments } = await import("@/lib/server/delete");
  const { deleteRoom } = await import("@/lib/server/rooms");

  const prisma = getPrisma();
  if (prisma) {
    try {
      const roomRows = await prisma.room.findMany({ where: { spaceId } });
      for (const room of roomRows) {
        await deleteRoom({ id: room.id, ...room });
      }
    } catch (err) {
      logError("spaces.prisma_cascade_rooms_failed", { error: err.message, spaceId });
    }
  }

  await deleteWhere("events", "spaceId", spaceId);

  if (prisma) {
    try {
      const courseRows = await prisma.course.findMany({ where: { spaceId } });
      for (const course of courseRows) {
        await deleteWhere("lessons", "courseId", course.id);
        await deleteWhere("modules", "courseId", course.id);
        await prisma.course.deleteMany({ where: { id: course.id } });
      }
    } catch (err) {
      logError("spaces.prisma_cascade_courses_failed", { error: err.message, spaceId });
    }
  }

  if (prisma) {
    try {
      const postRows = await prisma.post.findMany({ where: { spaceId } });
      for (const post of postRows) {
        await deletePostWithComments(post.id);
      }
    } catch (err) {
      logError("spaces.prisma_cascade_posts_failed", { error: err.message, spaceId });
    }
  }

  await deleteWhere("spaceMembers", "spaceId", spaceId);

  if (prisma) {
    try {
      await prisma.space.deleteMany({ where: { id: spaceId } });
      return;
    } catch (err) {
      logError("spaces.prisma_cascade_delete_failed", { error: err.message });
    }
  }
}

export async function listRoomsForSpace(spaceId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.room.findMany({ where: { spaceId } });
      return rows
        .map((row) => ({ id: row.id, name: row.name, slug: row.slug, status: row.status || "active", createdAt: toMillisValue(row.createdAt) || 0 }))
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      logError("spaces.prisma_rooms_failed", { error: err.message });
    }
  }
  return [];
}

export async function listEventsForSpace(spaceId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.event.findMany({ where: { spaceId } });
      return rows
        .map((row) => ({ id: row.id, title: row.title, description: row.description || "", startTime: toMillisValue(row.startTime) || 0 }))
        .sort((a, b) => a.startTime - b.startTime);
    } catch (err) {
      logError("spaces.prisma_events_failed", { error: err.message });
    }
  }
  return [];
}

export async function listCoursesForSpace(spaceId) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.course.findMany({ where: { spaceId } });
      return rows
        .map((row) => ({ id: row.id, title: row.title, description: row.description || "", createdAt: toMillisValue(row.createdAt) || 0 }))
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (err) {
      logError("spaces.prisma_courses_failed", { error: err.message });
    }
  }
  return [];
}
