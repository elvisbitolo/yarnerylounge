import { adminDb } from "@/lib/firebase/admin";
import { isActiveSub as isActiveSubLogic } from "@/lib/server/billing";

const FREE_ACCESS_SUB = {
  provider: "free",
  status: "active",
  tier: "flirting",
  plan: "monthly",
  isFreeAccess: true,
};

export async function getSubscription(uid) {
  const doc = await adminDb().collection("subscriptions").doc(uid).get();
  return doc.exists ? doc.data() : null;
}

export function isStaff(userDoc) {
  return userDoc?.role === "owner" || userDoc?.role === "moderator";
}

export async function getAccessSub(uid) {
  const doc = await adminDb().collection("users").doc(uid).get();
  const userDoc = doc.exists ? { id: doc.id, ...doc.data() } : null;
  if (isStaff(userDoc)) {
    return { status: "active", tier: "host", isStaffAccess: true };
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
  return sub.tier || "lounge";
}