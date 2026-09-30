// "Christa is live" — announce the owner's lounge arrivals to every member.
//
// Triggered from the JaaS token route, which already records a RoomEvent for
// every join. This module decides whether the join is worth announcing and
// then fans out over three channels, none of which may block or fail a join.
//
// The rules themselves live in ./lounge-live-core.js so they can be tested
// without a database.

import { createNotification } from "@/lib/server/notifications";
import { sendEmail } from "@/lib/server/email";
import { logError, logInfo } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";
import { ROOM_PRESENCE_WINDOW_MS } from "@/lib/server/room-presence";
import {
  LIVE_COOLDOWN_MS,
  LIVE_PRESENCE_GRACE_MS,
  buildLiveEmail,
  buildLiveMessage,
  isLoungeLiveEnabled,
  isLiveAnnouncer,
  selectRecipients,
  shouldAnnounce,
} from "./lounge-live-core.js";

const NOTIFICATION_TYPE = "lounge_live";

// Recipients are processed in batches so a large community cannot exhaust the
// function's memory or its request budget in one burst.
const BATCH = 25;

function vapidReady() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

/**
 * Whether she was already in this room moments before the join request.
 *
 * Without this, a refresh or a dropped websocket re-announces her and members
 * learn to ignore the notification. Presence is a better signal than the join
 * itself because it is written by the room UI's heartbeat, so it only reflects
 * a real, live session.
 */
async function wasRecentlyPresent(userId, roomId, now) {
  const prisma = getPrisma();
  if (!prisma || !userId || !roomId) return false;
  try {
    const cutoff = new Date(now - Math.max(LIVE_PRESENCE_GRACE_MS, ROOM_PRESENCE_WINDOW_MS));
    const row = await prisma.roomPresence.findFirst({
      where: {
        roomId,
        userId,
        joinedAt: { gte: cutoff },
        OR: [{ leftAt: null }, { leftAt: { gte: cutoff } }],
      },
      select: { id: true },
    });
    return Boolean(row);
  } catch (err) {
    // A failed check must not silence a real announcement, so this fails open.
    logError("lounge-live.presence_check_failed", { roomId, error: err.message });
    return false;
  }
}

/** Has she joined this exact room inside the cooldown window? */
async function joinedRecently(userId, roomId, now) {
  const prisma = getPrisma();
  if (!prisma || !userId || !roomId) return false;
  try {
    const row = await prisma.roomEvent.findFirst({
      where: { userId, roomId, joinedAt: { gte: new Date(now - LIVE_COOLDOWN_MS) } },
      select: { id: true },
    });
    return Boolean(row);
  } catch (err) {
    logError("lounge-live.cooldown_check_failed", { roomId, error: err.message });
    return false;
  }
}

/**
 * Push to one member, if they have a live subscription.
 *
 * Resolves to a status so the caller can fall back to email for members whose
 * subscription has gone stale. 404/410 mean the endpoint is gone for good, so
 * the row is dropped rather than retried forever.
 */
async function pushToUser({ userId, title, body, url }) {
  const prisma = getPrisma();
  if (!prisma || !vapidReady()) return { sent: false, reason: "unconfigured" };
  try {
    const subs = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, keys: true },
    });
    if (subs.length === 0) return { sent: false, reason: "no_subscription" };

    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    const payload = JSON.stringify({ title, body, url });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        sent += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        } else {
          logError("lounge-live.push_failed", { userId, error: err?.message });
        }
      }
    }
    return { sent: sent > 0, reason: sent > 0 ? "ok" : "all_failed" };
  } catch (err) {
    logError("lounge-live.push_error", { userId, error: err.message });
    return { sent: false, reason: "error" };
  }
}

/**
 * Announce the announcer's arrival in `room` to every other active member.
 *
 * Never throws: a member's join must not fail because Resend timed out or a
 * push endpoint rejected the payload. Every failure is logged and swallowed.
 *
 * @returns {Promise<{announced: boolean, reason: string, notified?: number, push?: number, email?: number}>}
 */
export async function announceLoungeLive({ user, room, now = Date.now() }) {
  const verdict = shouldAnnounce({
    enabled: isLoungeLiveEnabled(),
    announcer: isAnnouncerUser(user),
    roomName: room?.name || "",
  });
  if (!verdict.announce) {
    if (verdict.reason !== "not_announcer") {
      logInfo("lounge-live.skipped", { reason: verdict.reason, roomId: room?.id || null });
    }
    return { announced: false, reason: verdict.reason };
  }

  // Cheap guards first: both are a query, and both suppress the common case.
  const [present, recent] = await Promise.all([
    wasRecentlyPresent(user.uid, room.id, now),
    joinedRecently(user.uid, room.id, now),
  ]);
  const guard = shouldAnnounce({
    enabled: true,
    announcer: true,
    roomName: room?.name || "",
    recentJoin: recent,
    wasRecentlyPresent: present,
  });
  if (!guard.announce) {
    logInfo("lounge-live.suppressed", { reason: guard.reason, roomId: room.id });
    return { announced: false, reason: guard.reason };
  }

  const prisma = getPrisma();
  if (!prisma) return { announced: false, reason: "no_db" };

  let recipients = [];
  try {
    const rows = await prisma.user.findMany({
      where: { suspended: { not: true } },
      select: { id: true, email: true, notificationPreferences: true },
    });
    recipients = selectRecipients(rows, user.uid);
  } catch (err) {
    logError("lounge-live.recipients_failed", { error: err.message });
    return { announced: false, reason: "recipients_failed" };
  }

  const message = buildLiveMessage(room.name);
  const href = room?.slug ? `/rooms/${room.slug}` : "/rooms";
  const { subject, text } = buildLiveEmail({
    roomName: room.name,
    roomSlug: room?.slug,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });

  let notified = 0;
  let pushed = 0;
  let emailed = 0;

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (member) => {
        // Members who muted the type get nothing at all — not even email. The
        // pref is the single opt-out for all three channels.
        const prefs = member.notificationPreferences;
        if (prefs && prefs.events === false) return;

        try {
          await createNotification({
            userId: member.id,
            type: NOTIFICATION_TYPE,
            actorId: user.uid,
            actorName: user.name || "Christa",
            targetId: room.id,
            href,
            text: message,
          });
          notified += 1;
        } catch (err) {
          logError("lounge-live.notify_failed", { userId: member.id, error: err.message });
        }

        const push = await pushToUser({ userId: member.id, title: message, body: "Tap to join her now.", url: href });
        if (push.sent) {
          pushed += 1;
          return;
        }

        // No usable push subscription, so fall back to email. Skip silently if
        // there is no address rather than logging one failure per member.
        if (member.email && push.reason === "no_subscription") {
          try {
            await sendEmail({ to: member.email, subject, text });
            emailed += 1;
          } catch (err) {
            logError("lounge-live.email_failed", { userId: member.id, error: err.message });
          }
        }
      })
    );
  }

  logInfo("lounge-live.announced", {
    roomId: room.id,
    roomName: room.name,
    notified,
    pushed,
    emailed,
  });
  return { announced: true, reason: "live", notified, push: pushed, email: emailed };
}

function isAnnouncerUser(user) {
  return isLiveAnnouncer(user);
}
