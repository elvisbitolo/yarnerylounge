import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { isActiveSub as isActiveSubLogic } from "@/lib/server/billing";
import { mapSubscriptionRow } from "./subscription-core.js";
import { isOpenAccess, openAccessPlan } from "@/lib/server/access-policy";

const FREE_ACCESS_SUB = {
  provider: "free",
  status: "active",
  tier: "flirting",
  plan: "flirting",
  planName: "flirting",
  isFreeAccess: true,
};

// Subscriptions were the first collection cut over to Supabase (Phase 3).
export async function getSubscription(uid) {
  try {
    const prisma = getPrisma();
    if (!prisma) return null;
    const row = await prisma.subscription.findFirst({
      where: { OR: [{ id: uid }, { userId: uid }] },
    });
    return row ? mapSubscriptionRow(row) : null;
  } catch (err) {
    logError("subscription.prisma_read_failed", { error: err.message });
    return null;
  }
}

export function isStaff(userDoc) {
  return userDoc?.role === "owner" || userDoc?.role === "moderator";
}

export async function getAccessSub(uid) {
  let userDoc = null;
  // Staff role lives on the users collection; read Postgres first (the ETL
  // mirrors it).
  try {
    const prisma = getPrisma();
    if (prisma) {
      const row = await prisma.user.findUnique({
        where: { id: uid },
        select: { id: true, role: true },
      });
      if (row) userDoc = { id: row.id, role: row.role || null };
    }
  } catch (err) {
    logError("subscription.prisma_user_failed", { error: err.message });
  }
  if (isStaff(userDoc)) {
    return { status: "active", tier: "moving-in", planName: "moving-in", isStaffAccess: true };
  }

  // Open-access mode: everyone is admitted until there are enough paying
  // members to flip the gate on. This takes precedence over even an existing
  // subscription row so NO member is demoted to a paid/flirting tier while the
  // community is still ramping up — "tiers do not apply" until flipped off.
  if (isOpenAccess()) {
    const openPlan = openAccessPlan();
    return {
      provider: "open-access",
      status: "active",
      tier: openPlan,
      plan: openPlan,
      planName: openPlan,
      isOpenAccess: true,
    };
  }

  const sub = await getSubscription(uid);
  if (sub && isActiveSubLogic(sub)) {
    return sub;
  }

  return FREE_ACCESS_SUB;
}

export function isActiveSub(sub) {
  return isActiveSubLogic(sub);
}

export async function getTier(uid) {
  const sub = await getAccessSub(uid);
  if (!isActiveSubLogic(sub)) return null;
  return sub.tier || "flirting";
}