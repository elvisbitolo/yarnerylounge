import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { logError } from "@/lib/server/log";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ unread: 0, error: "Not signed in" }, { status: 401 });
  }
  const preview = new URL(request.url).searchParams.get("preview") === "1";
  const limited = rateLimitGuard(`notif-unread:${user.uid}`, { limit: preview ? 60 : 240 });
  if (limited) return limited;

  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Notifications are temporarily unavailable" }, { status: 503 });
    }

    // Keep the normal bell poll lightweight. Fetch a small preview only when
    // the member opens the dropdown; the unread count always covers every row.
    const unread = await prisma.notification.count({
      where: { userId: user.uid, read: false },
    });

    if (!preview) return NextResponse.json({ unread });

    const rows = await prisma.notification.findMany({
      where: { userId: user.uid },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        type: true,
        actorName: true,
        text: true,
        href: true,
        read: true,
        createdAt: true,
      },
    });

    const notifications = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    return NextResponse.json({ unread, notifications });
  } catch (error) {
    logError("notifications.unread_count_failed", { error: error?.message });
    return NextResponse.json({ error: "Unable to load notifications" }, { status: 500 });
  }
}
