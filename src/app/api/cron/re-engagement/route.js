import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/server/email";
import { createNotification } from "@/lib/server/notifications";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";
import {
  selectReengagementCandidates,
  buildReengagementEmail,
  buildWelcomeBackEmail,
  REENGAGEMENT_DAILY_LIMIT,
} from "@/lib/server/re-engagement-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_BASE = process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN;

export async function GET(req) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });

  const now = Date.now();
  const candidates = [];
  let cursor = "";
  try {
    while (candidates.length < REENGAGEMENT_DAILY_LIMIT) {
      const rows = await prisma.user.findMany({
        ...(cursor ? { where: { id: { gt: cursor } } } : {}),
        take: 500,
        orderBy: { id: "asc" },
        select: {
          id: true, name: true, email: true, notifications: true, suspended: true,
          notificationPreferences: true, extra: true, createdAt: true,
          sessions: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { lastSeenAt: true } },
        },
      });
      if (!rows.length) break;
      candidates.push(...selectReengagementCandidates(rows, {
        now,
        limit: REENGAGEMENT_DAILY_LIMIT - candidates.length,
      }));
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
        date: Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        }),
      };
    }
  } catch (err) {
    logError("reengagement.prisma_event_read_failed", { error: err.message });
  }

  const stats = { candidates: candidates.length, sent: 0, emailSent: 0, inAppSent: 0, skipped: 0, onboarding: 0, returning: 0 };
  for (const member of candidates) {
    let delivered = false;
    try {
      const created = await createNotification({
        userId: member.id,
        type: "reengagement",
        actorName: "The Secret Yarnery Team",
        href: "/feed",
        text: member.reengagementKind === "onboarding"
          ? "Welcome to Secret Yarnery. Explore the community and join your first conversation."
          : "We miss you at the Lounge. Come catch up with the community and see what's new.",
      });
      if (created) { delivered = true; stats.inAppSent++; }
    } catch (err) {
      logError("reengagement.notification_failed", { uid: member.id, error: err.message });
    }

    if (member.email && member.notifications !== "off") {
      const message = member.reengagementKind === "onboarding"
        ? buildWelcomeBackEmail({ name: member.name, appUrl: SITE_BASE })
        : buildReengagementEmail({ name: member.name, appUrl: SITE_BASE, nextEvent });
      try {
        await sendEmail({ to: member.email, ...message });
        delivered = true;
        stats.emailSent++;
      } catch (err) {
        logError("reengagement.email_failed", { uid: member.id, error: err.message });
      }
    }

    if (!delivered) { stats.skipped++; continue; }

    try {
      const extra = member.extra && typeof member.extra === "object" ? member.extra : {};
      await prisma.user.update({
        where: { id: member.id },
        data: { extra: { ...extra, reengagementSentAt: new Date().toISOString() } },
      });
      stats.sent++;
      stats[member.reengagementKind === "onboarding" ? "onboarding" : "returning"]++;
    } catch (err) {
      stats.skipped++;
      logError("reengagement.stamp_failed", { uid: member.id, error: err.message });
    }
  }

  return NextResponse.json({ ok: true, ...stats, timestamp: new Date().toISOString() });
}
