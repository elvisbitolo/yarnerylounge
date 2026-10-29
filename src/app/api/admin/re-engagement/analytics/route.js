import { NextResponse } from "next/server";
import { getCurrentUser, getUserDoc, canModerate } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;

function millis(value) {
  if (value == null) return NaN;
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(result) ? result : NaN;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await getUserDoc(user.uid);
  if (!canModerate(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const now = Date.now();
  const weekAgo = now - 7 * DAY;
  const cutoff = now - 2 * DAY;
  const stats = {
    totalMembers: 0,
    inactiveOver48Hours: 0,
    neverVisitedOver48Hours: 0,
    remindersSentLast7Days: 0,
    returnedAfterReminderLast7Days: 0,
    suspendedExcluded: 0,
  };
  let cursor = "";

  try {
    while (true) {
      const rows = await prisma.user.findMany({
        ...(cursor ? { where: { id: { gt: cursor } } } : {}),
        take: 500,
        orderBy: { id: "asc" },
        select: {
          id: true,
          suspended: true,
          createdAt: true,
          extra: true,
          sessions: { orderBy: { lastSeenAt: "desc" }, take: 1, select: { lastSeenAt: true } },
        },
      });
      if (!rows.length) break;

      for (const row of rows) {
        stats.totalMembers++;
        if (row.suspended) {
          stats.suspendedExcluded++;
          continue;
        }
        const extra = row.extra && typeof row.extra === "object" ? row.extra : {};
        const sentAt = millis(extra.reengagementSentAt);
        if (Number.isFinite(sentAt) && sentAt >= weekAgo) stats.remindersSentLast7Days++;

        const lastSeen = millis(row.sessions?.[0]?.lastSeenAt);
        const createdAt = millis(row.createdAt);
        const hasSession = (row.sessions || []).length > 0;
        const activity = Number.isFinite(lastSeen) ? lastSeen : createdAt;
        if (Number.isFinite(activity) && activity < cutoff) {
          stats.inactiveOver48Hours++;
          if (!hasSession) stats.neverVisitedOver48Hours++;
        }
        if (Number.isFinite(sentAt) && sentAt >= weekAgo && Number.isFinite(lastSeen) && lastSeen > sentAt) {
          stats.returnedAfterReminderLast7Days++;
        }
      }

      cursor = rows[rows.length - 1].id;
      if (rows.length < 500) break;
    }
  } catch (err) {
    logError("reengagement.analytics_failed", { error: err?.message });
    return NextResponse.json({ error: "Could not load reactivation analytics" }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    windowDays: 7,
    inactivityThresholdHours: 48,
    ...stats,
    generatedAt: new Date(now).toISOString(),
  });
}
