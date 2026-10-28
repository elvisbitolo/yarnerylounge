import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = rateLimitGuard(`notif-read-all:${user.uid}`, { limit: 30 });
  if (limited) return limited;

  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Notifications are temporarily unavailable" }, { status: 503 });
    }

    const result = await prisma.notification.updateMany({
      where: { userId: user.uid, read: false },
      data: { read: true, readAt: new Date() },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (error) {
    logError("notifications.mark_all_read_failed", { error: error?.message });
    return NextResponse.json({ error: "Unable to mark notifications as read" }, { status: 500 });
  }
}
