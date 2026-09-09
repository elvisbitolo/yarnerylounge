import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { createNotification } from "@/lib/server/notifications";

const WELCOME = {
  "hooking-up":
    "Welcome to Hooking Up! Your lounge membership is live — join video rooms, post in the feed, and match with crafters on the calendar.",
  "moving-in":
    "Welcome to Moving In! You now have host powers — create rooms, start groups, and lead the community. Check the Host tools in your sidebar.",
  flirting:
    "Welcome to the Speakeasy, guest! Upgrade to Hooking Up to unlock live video rooms, the Match Maker, and the matching calendar.",
};

export async function createWelcomeMessage({ uid, plan, role }) {
  const text = WELCOME[plan] || WELCOME.flirting;
  await createNotification({
    userId: uid,
    type: "automation",
    actorId: "system",
    actorName: "The Speakeasy Team",
    targetId: "",
    href: "/dashboard",
    text,
  });
  const prisma = getPrisma();
  if (prisma) {
    try {
      const user = await prisma.user.findUnique({ where: { id: uid } });
      if (user) {
        const extra = user.extra && typeof user.extra === "object" ? user.extra : {};
        await prisma.user.update({
          where: { id: uid },
          data: { extra: { ...extra, welcomeDeliveredAt: new Date().toISOString() } },
        });
      }
    } catch (err) {
      logError("messages.prisma_welcome_marker_failed", { error: err.message });
    }
  }
  return { plan, role };
}
