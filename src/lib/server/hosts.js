import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { canModerate } from "@/lib/server/auth";
import { getRoom, getRoomBySlug } from "@/lib/server/rooms";
import { getEvent } from "@/lib/server/events";
import { getCourse } from "@/lib/server/courses";
import { getSpace } from "@/lib/server/spaces";
import { getGroup } from "@/lib/server/groups";
import {
  HOST_SCOPE_TYPES,
  hostAssignmentKey,
  normalizeHostRole,
  rightsFromAssignments,
  evaluateScopeRights,
} from "@/lib/server/host-core";

export { HOST_SCOPE_TYPES };

const SCOPE_LOADERS = {
  room: getRoom,
  event: getEvent,
  course: getCourse,
  group: getGroup,
  space: getSpace,
};

export async function scopeExists(scopeType, scopeId) {
  const loader = SCOPE_LOADERS[scopeType];
  if (!loader || !scopeId) return false;
  const doc = await loader(scopeId);
  return !!doc;
}

export async function resolveScopeData(scopeType, scopeId) {
  if (scopeType === "room") {
    const room = await getRoom(scopeId);
    return { spaceId: room?.spaceId || "", groupId: room?.groupId || "" };
  }
  if (scopeType === "event") {
    const event = await getEvent(scopeId);
    const room = event?.roomSlug ? await getRoomBySlug(event.roomSlug) : null;
    return { spaceId: event?.spaceId || "", roomId: room?.id || "" };
  }
  if (scopeType === "course") {
    const course = await getCourse(scopeId);
    return { spaceId: course?.spaceId || "" };
  }
  if (scopeType === "group") {
    const group = await getGroup(scopeId);
    return { spaceId: group?.spaceId || "" };
  }
  return {};
}

export async function listHostAssignments({ scopeType, scopeId, userId } = {}) {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const where = {};
      if (scopeType && scopeId) {
        where.scopeType = scopeType;
        where.scopeId = scopeId;
      } else if (userId) {
        where.userId = userId;
      }
      const rows = await prisma.hostAssignment.findMany({
        where,
        take: 200,
      });
      if (rows.length) {
        return rows.map((r) => ({
          id: r.id,
          scopeType: r.scopeType,
          scopeId: r.scopeId,
          userId: r.userId,
          role: r.role || "",
          grantedBy: r.grantedBy,
        }));
      }
    } catch (err) {
      logError("hosts.prisma_list_assignments_failed", { error: err.message });
    }
  }
  return [];
}

export async function setHostAssignment({ scopeType, scopeId, userId, role, grantedBy }) {
  const normalizedRole = normalizeHostRole(role);
  if (!normalizedRole || !scopeType || !scopeId || !userId || !grantedBy) {
    return { ok: false, error: "Invalid host assignment" };
  }
  const id = hostAssignmentKey({ scopeType, scopeId, userId });
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.hostAssignment.findUnique({ where: { id } });
      if (existing) {
        await prisma.hostAssignment.update({
          where: { id },
          data: {
            role: normalizedRole,
            updatedAt: new Date(),
          },
        });
      } else {
        await prisma.hostAssignment.create({
          data: {
            id,
            scopeType,
            scopeId,
            userId,
            role: normalizedRole,
            grantedBy,
          },
        });
      }
      return { ok: true, id };
    } catch (err) {
      logError("hosts.prisma_set_assignment_failed", { error: err.message });
    }
  }
  return { ok: false, error: "Database unavailable" };
}

export async function removeHostAssignment(scopeType, scopeId, userId) {
  const id = hostAssignmentKey({ scopeType, scopeId, userId });
  const prisma = getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.hostAssignment.findUnique({ where: { id } });
      if (!existing) return { ok: false, error: "Assignment not found" };
      await prisma.hostAssignment.delete({ where: { id } });
      return { ok: true, id };
    } catch (err) {
      logError("hosts.prisma_remove_assignment_failed", { error: err.message });
    }
  }
  return { ok: false, error: "Database unavailable" };
}

export async function getUserHostRights(uid) {
  if (!uid) return {};
  const assignments = await listHostAssignments({ userId: uid });
  return rightsFromAssignments(assignments);
}

export async function userHasHostRights(uid) {
  if (!uid) return false;
  const assignments = await listHostAssignments({ userId: uid });
  return assignments.length > 0;
}

export async function canManageScope(uid, scopeType, scopeId) {
  const rights = await getScopedHostRights(uid, scopeType, scopeId);
  return rights.isStaff || rights.isHost;
}

export async function getScopedHostRights(uid, scopeType, scopeId) {
  if (!uid || !scopeType || !scopeId) {
    return { isStaff: false, isHost: false, isCoHost: false, roles: [] };
  }
  let role = null;
  const prisma = getPrisma();
  if (prisma) {
    try {
      const userRow = await prisma.user.findUnique({ where: { id: uid }, select: { role: true } });
      if (userRow) role = userRow.role;
    } catch (err) {
      logError("hosts.prisma_get_user_role_failed", { error: err.message });
    }
  }
  const [rights, scopeData] = await Promise.all([
    getUserHostRights(uid),
    resolveScopeData(scopeType, scopeId),
  ]);
  const isStaff = canModerate({ role });
  return {
    isStaff,
    ...evaluateScopeRights(rights, scopeType, scopeId, scopeData, isStaff),
  };
}
