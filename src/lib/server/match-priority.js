import { getPrisma } from "@/lib/db/prisma";
import { ACTIVE_STATUSES, isActiveSub } from "@/lib/server/billing";
import { effectiveSubscription } from "@/lib/server/subscription-core";
import { displayTier, tierForRole } from "@/lib/server/plans";
import { isOpenAccess } from "@/lib/server/access-policy";
import { compareMovingInPriority } from "./blind-date-core.js";

export async function getMovingInPriorityIds(members, prisma = getPrisma()) {
  const ids = [...new Set(members.map((member) => member.id).filter(Boolean))];
  if (!ids.length) return new Set();
  if (isOpenAccess()) return new Set(ids);

  const priorityIds = new Set(
    members.filter((member) => tierForRole(member.role) === "moving-in").map((member) => member.id)
  );
  const subscriptionIds = ids.filter((id) => !priorityIds.has(id));
  if (!subscriptionIds.length) return priorityIds;

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      OR: [{ id: { in: subscriptionIds } }, { userId: { in: subscriptionIds } }],
    },
    select: {
      id: true,
      userId: true,
      provider: true,
      status: true,
      tier: true,
      plan: true,
      planName: true,
      currentPeriodEnd: true,
      trialEnd: true,
    },
  });
  const byUserId = new Map();
  for (const subscription of subscriptions) {
    const id = subscription.userId || subscription.id;
    if (id && isActiveSub(subscription)) byUserId.set(id, effectiveSubscription(subscription));
  }

  for (const id of subscriptionIds) {
    const subscription = byUserId.get(id);
    const tier = displayTier(
      subscription?.tier || subscription?.planName || subscription?.plan,
      null
    );
    if (tier === "moving-in") priorityIds.add(id);
  }
  return priorityIds;
}
