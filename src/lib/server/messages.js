import { adminDb } from "@/lib/firebase/admin";
import { createNotification } from "@/lib/server/notifications";

const WELCOME = {
  "hooking-up":
    "Welcome to Hooking Up! Your lounge membership is live — join video rooms, post in the feed, and match with crafters on the calendar.",
  "moving-in":
    "Welcome to Moving In! You now have host powers — create rooms, start groups, and lead the community. Check the Host tools in your sidebar.",
  flirting:
    "Welcome to the Speakeasy, guest! Upgrade to Hooking Up to unlock live video rooms, the Match Maker, and the matching calendar.",
};

// Delivers a welcome message as an in-app notification (bell) so newly paid
// members see the plan benefits immediately. Extend into DM/pinned-post flows
// via the automations infra in a later step.
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
  await adminDb().collection("users").doc(uid).update({ welcomeDeliveredAt: new Date() }).catch(() => {});
  return { plan, role };
}