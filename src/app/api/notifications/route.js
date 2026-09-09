import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { listNotifications } from "@/lib/server/notifications";
import { rateLimitGuard } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ unread: 0, error: "Not signed in" }, { status: 401 });
  }
  const limited = rateLimitGuard(`notif-unread:${user.uid}`, { limit: 240 });
  if (limited) return limited;
  const list = await listNotifications(user.uid, 50);
  const unread = list.filter((n) => !n.read).length;
  return NextResponse.json({ unread });
}