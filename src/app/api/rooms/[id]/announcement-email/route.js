import { NextResponse } from "next/server";
import { requireActiveMember, guardJson } from "@/lib/server/authorize";
import { rateLimitGuard } from "@/lib/server/rate-limit";
import { requireRoomAccess, resolveRoomAccess } from "@/lib/server/room-access";
import { getPrisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/server/email";
import { logError } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const CHRISTAS_EMAIL = "secretyarnery@gmail.com";

export async function POST(_req, { params }) {
  const { id: roomId } = await params;
  const auth = await requireActiveMember({ owner: true });
  const denied = guardJson(auth);
  if (denied) return denied;
  if (String(auth.userDoc?.email || "").trim().toLowerCase() !== CHRISTAS_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const limited = rateLimitGuard(`room-announcement-email:${auth.user.uid}`, { limit: 1, windowMs: 300000 });
  if (limited) return limited;
  const access = await requireRoomAccess(roomId, auth.user.uid, auth.userDoc);
  if (access.denied) return access.denied;
  const prisma = getPrisma();
  if (!prisma) return NextResponse.json({ error: "Email service unavailable" }, { status: 503 });

  const room = access.room;
  const site = (process.env.NEXT_PUBLIC_APP_URL || "https://www.christasspeakeasy.com").replace(/\/$/, "");
  const loungeUrl = room.slug ? `${site}/rooms/${encodeURIComponent(room.slug)}` : `${site}/rooms`;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let cursor = "";

  try {
    while (true) {
      const members = await prisma.user.findMany({
        where: { id: { not: auth.user.uid, ...(cursor ? { gt: cursor } : {}) }, OR: [{ suspended: false }, { suspended: null }] },
        orderBy: { id: "asc" },
        take: 100,
        select: { id: true, name: true, email: true, notifications: true, notificationPreferences: true, role: true, extra: true },
      });
      if (!members.length) break;
      for (const member of members) {
        const email = String(member.email || "").trim();
        const prefs = member.notificationPreferences && typeof member.notificationPreferences === "object" ? member.notificationPreferences : {};
        if (!email || member.notifications === "off" || prefs.emailRoomAnnouncements === false) {
          skipped += 1;
          continue;
        }
        try {
          const memberAccess = room.alwaysOn ? { room } : await resolveRoomAccess(room.id, member.id, member);
          if (memberAccess.denied) {
            skipped += 1;
            continue;
          }
          const emailResult = await sendEmail({
            to: email,
            subject: `Christa is now in ${room.name || "the lounge"}`,
            text: `Hi ${member.name || "there"},\n\nChrista is now in ${room.name || "the lounge"} and would love to see you there.\n\nJoin the lounge: ${loungeUrl}\n\nYou can unsubscribe from optional email notifications in Account → Notifications.`,
          });
          if (emailResult?.skipped) {
            failed += 1;
            continue;
          }
          sent += 1;
        } catch (error) {
          failed += 1;
          logError("room.announcement_email_recipient_failed", { roomId: room.id, recipientId: member.id, error: error?.message });
        }
      }
      cursor = members[members.length - 1].id;
      if (members.length < 100) break;
    }
  } catch (error) {
    logError("room.announcement_email_failed", { roomId: room.id, actorId: auth.user.uid, error: error?.message });
    return NextResponse.json({ error: "Could not send the lounge announcement" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sent, failed, skipped, roomName: room.name || "the lounge" });
}
