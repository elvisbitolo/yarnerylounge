import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { getAccessSub, isActiveSub } from "@/lib/server/subscription";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getScopedHostRights } from "@/lib/server/hosts";

function deny(status, error) {
  return { ok: false, status, error };
}

export async function authorize(options = {}) {
  const { active, tier, owner, moderator, host, groupId, self } = options;

  const user = await getCurrentUser();
  if (!user) return deny(401, "Not signed in");

  const userDoc = await getUserDoc(user.uid);

  if (owner && userDoc?.role !== "owner") return deny(403, "Forbidden");
  if (moderator && !canModerate(userDoc)) return deny(403, "Forbidden");
  if (self && user.uid !== self && !canModerate(userDoc)) return deny(403, "Forbidden");

  if (host) {
    const sub = await getAccessSub(user.uid);
    const isHost =
      userDoc?.role === "owner" ||
      (userDoc?.role === "host" && isActiveSub(sub));
    if (!isHost) return deny(403, "Host access required");
  }

  let sub = null;
  const needsSub = active !== false || tier;
  if (needsSub) {
    sub = await getAccessSub(user.uid);
    if (!isActiveSub(sub)) return deny(403, "Active membership required");
  }

  if (groupId) {
    let isMember = false;
    if (userDoc?.role !== "owner") {
      const prisma = getPrisma();
      if (prisma) {
        try {
          const row = await prisma.groupMember.findUnique({
            where: { id: `${groupId}_${user.uid}` },
          });
          isMember = !!row;
        } catch (err) {
          logError("authorize.prisma_group_member_failed", { error: err.message });
        }
      }
      if (!isMember) {
        return deny(403, "Join the group first");
      }
    }
  }

  return { ok: true, user, userDoc, sub };
}

export function guardJson(result) {
  return result.ok ? null : NextResponse.json({ error: result.error }, { status: result.status });
}

export const requireUser = (options = {}) => authorize({ active: false, ...options });

export const requireActiveMember = (options = {}) => authorize({ active: true, ...options });

export const requireTier = (tier, options = {}) =>
  authorize({ active: true, tier, ...options });

export const requireOwner = (options = {}) =>
  authorize({ owner: true, active: false, ...options });

export const requireHostUser = (options = {}) =>
  authorize({ host: true, active: false, ...options });

export const requireModerator = (options = {}) =>
  authorize({ moderator: true, active: false, ...options });

export const requireGroupMember = (groupId, options = {}) =>
  authorize({ groupId, active: false, ...options });

async function scopeBase(options = {}) {
  const base = await authorize({ active: false, ...options });
  if (!base.ok) return base;
  const { scopeType, scopeId } = options;
  if (!scopeType || !scopeId) return deny(400, "Scope required");
  const rights = await getScopedHostRights(base.user.uid, scopeType, scopeId);
  return { ...base, rights };
}

export async function requireScopeHost(options = {}) {
  const base = await scopeBase(options);
  if (!base.ok) return base;
  if (!base.rights.isHost) return deny(403, "Scoped host access required");
  return base;
}

export async function requireScopeHostOrCoHost(options = {}) {
  const base = await scopeBase(options);
  if (!base.ok) return base;
  if (!base.rights.isCoHost) return deny(403, "Host or co-host access required");
  return base;
}
