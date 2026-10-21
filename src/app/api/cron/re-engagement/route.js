import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { sendEmail } from "@/lib/server/email";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";
import {
  selectReengagementCandidates,
  buildReengagementEmail,
} from "@/lib/server/re-engagement-core";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_BASE = process.env.NEXT_PUBLIC_APP_URL || CANONICAL_ORIGIN;

// Daily cron: warmly nudge members who have drifted away. Timing rules and the
// copy live in re-engagement-core so they can be unit tested.
export async function GET(req) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ ok: true, sent: 0 });

  let rows = [];
  try {
    rows = await prisma.user.findMany({
      take: 2000,
      select: {
        id: true,
        name: true,
        email: true,
        suspended: true,
        notificationPreferences: true,
        extra: true,
        createdAt: true,
      },
    });
  } catch (err) {
    logError("reengagement.prisma_read_failed", { error: err.message });
    return NextResponse.json({ error: "Read failed" }, { status: 503 });
  }

  const candidates = selectReengagementCandidates(rows, { now: Date.now() });

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
  for (const member of candidates) {
    const { subject, text, html } = buildReengagementEmail({
      name: member.name,
      appUrl: SITE_BASE,
      nextEvent,
    });
    try {
      await sendEmail({ to: member.email, subject, text, html });
      const extra = member.extra && typeof member.extra === "object" ? member.extra : {};
      await prisma.user.update({
        where: { id: member.id },
        data: { extra: { ...extra, reengagementSentAt: new Date().toISOString() } },
      });
      sent++;
    } catch (err) {
      skipped++;
      logError("reengagement.send_failed", { uid: member.id, error: err.message });
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent,
    skipped,
    timestamp: new Date().toISOString(),
  });
}
