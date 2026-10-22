import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

// Web-push delivery to every device a member has registered.
//
// This is best-effort by design: a notification must still be written (and the
// action that triggered it must still succeed) when push is unconfigured, the
// member has no subscription, or the push service is down. It therefore never
// throws — callers can fire and forget.

export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

export async function sendPushToUser(userId, { title, body, url = "/" } = {}) {
  if (!userId || !title) return { sent: 0, reason: "invalid" };
  if (!pushConfigured()) return { sent: 0, reason: "unconfigured" };

  const prisma = getPrisma();
  if (!prisma) return { sent: 0, reason: "no_db" };

  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, keys: true },
    });
  } catch (err) {
    logError("push.read_failed", { userId, error: err.message });
    return { sent: 0, reason: "read_failed" };
  }
  if (!subs.length) return { sent: 0, reason: "no_subscription" };

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({ title, body: body || "", url: url || "/" });
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        sent += 1;
      } catch (err) {
        // 404/410 mean the endpoint is gone for good: drop it rather than
        // retrying forever. Anything else is transient and logged only.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          logError("push.send_failed", { userId, statusCode: err?.statusCode, error: err?.message });
        }
      }
    })
  );

  return { sent, reason: sent > 0 ? "ok" : "all_failed" };
}
