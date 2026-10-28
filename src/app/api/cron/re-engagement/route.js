import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/server/email";
import { createNotification } from "@/lib/server/notifications";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";
import {
  selectReengagementCandidates,
  buildReengagementEmail,
  REENGAGEMENT_DAILY_LIMIT,
} from "@/lib/server/re-engagement-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_BASE = process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN;

// Daily cron: warmly nudge members who have drifted away. Timing rules and the
// copy live in re-engagement-core so they can be unit tested.
export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: true, sent: 0 });

  const now = Date.now();
  const candidates = [];
  let cursor = "";
  try {
    // Walk the full member table in stable ID batches. The daily cap applies to
    // eligible recipients, not to the first 2,000 accounts in the database.
    while (candidates.length < REENGAGEMENT_DAILY_LIMIT) {
      const rows = await prisma.user.findMany({
        ...(cursor ? { where: { id: { gt: cursor } } } : {}),
        take: 500,
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          notifications: true,
          suspended: true,
          notificationPreferences: true,
          extra: true,
          createdAt: true,
        },
      });
      if (!rows.length) break;
      const remaining = REENGAGEMENT_DAILY_LIMIT - candidates.length;
      if (remaining > 0) {
        candidates.push(...selectReengagementCandidates(rows, { now, limit: remaining }));
      }
      cursor = rows[rows.length - 1].id;
      if (rows.length < 500) break;
    }
  } catch (err) {
    logError("reengagement.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Read failed" }, { status: 503 });
  }

  let nextEvent = null;
  try {
    const ev = await prisma.event.findFirst({
      where: { startTime: { gte: new Date() } },
      orderBy: { startTime: "asc" },
      select: { title: true, startTime: true },
    });
    if (ev) {
      const date = ev.startTime instanceof Date ? ev.startTime : new Date(ev.startTime);
      nextEvent = {
        title: ev.title || "Event",
        date: isNaN(date.getTime())
          ? ""
          : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      };
    }
  } catch (err) {
    logError("reengagement.prisma_event_read_failed", { error: err.message });
  }

  let sent = 0;
  let skipped = 0;
  let emailSent = 0;
  let inAppSent = 0;
  for (const member of candidates) {
    let delivered = false;
    try {
      // createNotification writes the in-app item and dispatches registered
      // browser push subscriptions. The notification preference gate is shared
      // with the rest of the community and is respected for every recipient.
      const created = await createNotification({
        userId: member.id,
        type: "reengagement",
        actorName: "The Secret Yarnery Team",
        href: "/feed",
        text: "We miss you at the Lounge. Come catch up with the community and see what's new.",
      });
      if (created) {
        delivered = true;
        inAppSent++;
      }
    } catch (err) {
      logError("reengagement.notification_failed", { uid: member.id, error: err.message });
    }

    // Email is an additional channel. Respect the account-wide email switch;
    // members without an email can still receive in-app and browser push alerts.
    if (member.email && member.notifications !== "off") {
      const { subject, text, html } = buildReengagementEmail({
        name: member.name,
        appUrl: SITE_BASE,
        nextEvent,
      });
      try {
        await sendEmail({ to: member.email, subject, text, html });
        delivered = true;
        emailSent++;
      } catch (err) {
        logError("reengagement.email_failed", { uid: member.id, error: err.message });
      }
    }

    if (!delivered) {
      skipped++;
      continue;
    }

    try {
      const extra = member.extra && typeof member.extra === "object" ? member.extra : {};
      await prisma.user.update({
        where: { id: member.id },
        data: { extra: { ...extra, reengagementSentAt: new Date().toISOString() } },
      });
      sent++;
    } catch (err) {
      skipped++;
      logError("reengagement.stamp_failed", { uid: member.id, error: err.message });
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    inAppSent,
    emailSent,
    skipped,
    timestamp: new Date().toISOString(),
  });
}
