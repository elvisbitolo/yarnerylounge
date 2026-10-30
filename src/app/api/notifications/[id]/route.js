import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { markNotificationRead } from "@/lib/server/notifications";

export async function POST(req, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const ok = await markNotificationRead(id, user.uid);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Return the authoritative unread total so the bell never has to guess
  // whether a stale preview item was already marked read in another tab.
  try {
    const prisma = getPrisma();
    const unread = prisma
      ? await prisma.notification.count({ where: { userId: user.uid, read: false } })
      : null;
    return NextResponse.json({ ok: true, unread });
  } catch {
    // The read update already succeeded; the client can refresh the count on
    // its next normal poll rather than treating the read action as a failure.
    return NextResponse.json({ ok: true, unread: null });
  }
}
