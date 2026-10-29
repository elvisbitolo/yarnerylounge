import { after } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { getUserDoc } from "@/lib/server/auth";
import { sendPushToUser } from "@/lib/server/push";
import { sendEmail } from "@/lib/server/email";
import { buildPushPayload } from "@/lib/server/push-core";
import { notificationRow } from "@/lib/server/notifications-core";
import { isWhatsAppConfigured, sendWhatsAppText } from "@/lib/server/social/whatsapp";

const NOTIFICATION_TYPE_TO_PREF = {
  comment: "feed",
  like: "feed",
  mention: "mentions",
  chat: "chat",
  // Direct-message handlers use "dm"; keep them under the same member preference.
  dm: "chat",
  event_reminder: "events",
  course_published: "events",
  event_rsvp: "events",
  // RSVP handlers use these legacy types; keep delivery under the Events preference.
  rsvp: "events",
  availability_rsvp: "events",
  lounge_live: "events",
  space_activity: "feed",
  follow: "feed",
  automation: "automations",
  digest: "automations",
  reengagement: "automations",
  // The Daily Match arrives once a day. There is no dedicated "matches"
  // preference yet, so it rides the "feed" opt-out rather than being
  // unmuteable - a daily notification members cannot silence is worse than
  // one filed under the closest existing bucket.
  daily_match: "feed",
  // Watch alerts ("tell me when they come online / enter a lounge") are a
  // deliberate, per-member subscription with no natural home among the other
  // buckets, so they get their own opt-out rather than riding along with feed
  // or chat.
  watch_online: "watch",
  watch_room: "watch",
  priority_online: "watch",
  recording_ready: "events",
};

function toMillisValue(v) {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return new Date(v.toMillis());
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  return new Date(v);
}

// Maps a Prisma Notification row to the doc shape consumers expect.
function mapNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    actorId: row.actorId || "",
    actorName: row.actorName || "",
    targetId: row.targetId || "",
    href: row.href || "",
    text: row.text,
    read: !!row.read,
    readAt: toMillisValue(row.readAt) || null,
    createdAt: toMillisValue(row.createdAt),
  };
}

async function shouldNotify(userId, type) {
  const prefKey = NOTIFICATION_TYPE_TO_PREF[type];
  if (!prefKey) return true;
  const userDoc = await getUserDoc(userId);
  const prefs = userDoc?.notificationPreferences;
  if (!prefs) return true;
  return prefs[prefKey] !== false;
}

// Deliver the push after the response is sent so the triggering action (a
// comment, a follow, a cron tick) never waits on a push service. `after()` is
// only valid in a request scope; outside one (older cron/CLI callers) fall back
// to a fire-and-forget call.
function dispatchPush(userId, payload) {
  const run = () =>
    sendPushToUser(userId, payload).catch((err) =>
      logError("notifications.push_failed", { error: err?.message })
    );
  try {
    after(run);
  } catch {
    run();
  }
}

/**
 * Create one in-app notification (and mirror it to the member's push devices).
 *
 * Returns whether the row was actually written: the pref gate and the write
 * itself both swallow failures silently, so callers that count deliveries —
 * the lounge-live broadcast counts every recipient — must not treat an
 * undefined return as success.
 */
export async function createNotification({
  userId,
  type,
  actorId,
  actorName,
  targetId,
  href,
  text,
}) {
  const enabled = await shouldNotify(userId, type);
  if (!enabled) return false;

  const data = notificationRow({
    userId,
    type,
    actorId,
    actorName,
    targetId,
    href,
    text,
  });
  const prisma = getPrisma();
  if (!prisma) return false;
  try {
    await prisma.notification.create({ data });
  } catch (err) {
    logError("notifications.prisma_create_failed", { error: err.message });
    return false;
  }

  // Mirror the in-app row to the member's devices so members who are not on the
  // site are recalled too. Respects the same type→preference gate above.
  dispatchPush(userId, buildPushPayload({ actorName, text, href }));

  if (type === "priority_online") {
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, notifications: true },
      });
      if (recipient?.email && recipient.notifications !== "off") {
        const site = process.env.NEXT_PUBLIC_SITE_URL || "https://www.christasspeakeasy.com";
        const url = href?.startsWith("http") ? href : `${site}${href || "/members"}`;
        await sendEmail({
          to: recipient.email,
          subject: `${actorName || "Secret Yarnery"} is now online`,
          text: `${actorName || "Secret Yarnery"} is now online on Christa's Speakeasy. View profile: ${url}`,
          html: `<p><strong>${actorName || "Secret Yarnery"}</strong> is now online on Christa's Speakeasy.</p><p><a href="${url}">View profile</a></p><p>You can manage notification preferences in your account.</p>`,
        });
      }
    } catch (err) {
      logError("notifications.priority_online_email_failed", { userId, error: err?.message });
    }
  }

  // WhatsApp DM (additive). Only for mentions and DMs.
  try {
    if ((isWhatsAppConfigured() || (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)) && (type === "mention" || type === "dm")) {
      const run = async () => {
        try {
          const p = getPrisma();
          if (!p) return;
          const link = await p.socialLink.findFirst({ where: { userId, provider: "whatsapp", enabled: true } });
          if (!link) return;
          const to = link.waId || String(link.phoneE164 || "").replace(/^\+/, "").replace(/\D/g, "");
          if (!to) return;
          try { console.log(JSON.stringify({event:"whatsapp_attempt", userId, type, to, enabled: link.enabled})); } catch {}
          const site = process.env.NEXT_PUBLIC_SITE_URL || "https://www.christasspeakeasy.com";
          const fullHref = href?.startsWith("http") ? href : `${site}${href || ""}`;
          const msg = `${text || "You have a new notification"}${fullHref ? `\n${fullHref}` : ""}\n— The Yarnery`;
          const res = await sendWhatsAppText({ to, body: msg });
          try { console.log(JSON.stringify({event:"whatsapp_sent", userId, type, to})); } catch {}
        } catch (e) {
          try { console.log(JSON.stringify({event:"whatsapp_failed", userId, type, error: e?.message})); } catch {}
          logError("notifications.whatsapp_failed", { userId, type, error: e?.message });
        }
      };
      try { after(run); } catch { run(); }
    }
  } catch (e) {
    logError("notifications.whatsapp_dispatch_failed", { userId, type, error: e?.message });
  }

  return true;
}

export async function listNotifications(uid, limit = 50) {
  try {
    const prisma = getPrisma();
    if (!prisma) return [];
    const rows = await prisma.notification.findMany({
      where: { userId: uid },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapNotificationRow);
  } catch (err) {
    logError("notifications.prisma_list_failed", { error: err.message });
    return [];
  }
}

export async function markNotificationRead(id, uid) {
  try {
    const prisma = getPrisma();
    if (!prisma) return false;
    const row = await prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== uid) return false;
    await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
    return true;
  } catch (err) {
    logError("notifications.prisma_mark_read_failed", { error: err.message });
    return false;
  }
}