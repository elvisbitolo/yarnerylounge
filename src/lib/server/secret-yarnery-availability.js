import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { createNotification } from "@/lib/server/notifications";
import { NOT_SUSPENDED } from "@/lib/server/member-visibility-core";

const SECRET_YARNERY_EMAIL = "secretyarnery@gmail.com";

// Broadcast only on a real offline -> online transition, called from the
// presence heartbeat. createNotification writes the in-app row and mirrors it
// to any registered browser-push subscriptions. Delivery is best-effort per
// member: one broken subscription must not block the rest of the community.
export async function announceSecretYarneryAvailable(userId) {
  const prisma = getPrisma();
  if (!prisma || !userId) return { notified: 0 };

  try {
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, suspended: true, extra: true },
    });

    if (
      !target ||
      target.suspended ||
      String(target.email || "").trim().toLowerCase() !== SECRET_YARNERY_EMAIL ||
      target.extra?.chatSettings?.onlineVisibility === "nobody"
    ) {
      return { notified: 0 };
    }

    const recipients = await prisma.user.findMany({
      where: { ...NOT_SUSPENDED, id: { not: target.id } },
      select: { id: true },
    });

    let notified = 0;
    for (const recipient of recipients) {
      const created = await createNotification({
        userId: recipient.id,
        type: "secret_yarnery_available",
        actorId: target.id,
        actorName: target.name || "Secret Yarnery",
        targetId: target.id,
        href: `/members/${target.id}`,
        text: "is now available! Come join the community.",
      });
      if (created) notified += 1;
    }

    return { notified };
  } catch (err) {
    logError("secret_yarnery.availability_broadcast_failed", {
      userId,
      error: err?.message,
    });
    return { notified: 0 };
  }
}
