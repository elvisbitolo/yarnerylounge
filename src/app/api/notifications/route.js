import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ unread: 0, error: "Not signed in" }, { status: 401 });
  }
  const limited = rateLimitGuard(`notif-unread:${user.uid}`, { limit: 240 });
  if (limited) return limited;

  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Notifications are temporarily unavailable" }, { status: 503 });
    }

    // Count every unread row, not just the latest 50 shown on the notifications page.
    const unread = await prisma.notification.count({
      where: { userId: user.uid, read: false },
    });

    return NextResponse.json({ unread });
  } catch (error) {
    logError("notifications.unread_count_failed", { error: error?.message });
    return NextResponse.json({ error: "Unable to load notification count" }, { status: 500 });
  }
}
